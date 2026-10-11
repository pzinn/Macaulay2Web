/* eslint-env serviceworker */
// Macaulay2Web -- WebAssembly engine, service worker side (see src/client/wasmEngine.ts).
//
// 1. Input channel. Emscripten reads stdin synchronously, so while Macaulay2
// waits for input, its worker (m2wasm-worker.js) blocks on a synchronous
// XMLHttpRequest to __m2wasm__/poll, which is held here until the page posts
// the next messages to __m2wasm__/send. Interrupt requests go the same way
// (__m2wasm__/interrupt, polled by the worker at __m2wasm__/check).
// Unlike SharedArrayBuffer/Atomics this needs no cross-origin isolation
// (COOP/COEP headers), which static hosts such as GitHub Pages cannot set.
// 2. Uploads. POST /upload (file uploads, editor autosave) is handed to the
// page running the engine, which writes the files where Macaulay2 sees them.
// 3. Persistent storage. The files in Macaulay2's home directory are kept in
// IndexedDB, so that they survive reloads and resets: the worker restores them
// before Macaulay2 starts (__m2wasm__/files) and sends what changed whenever
// Macaulay2 waits for input (__m2wasm__/save). Uploads and editor saves are
// also stored as they pass through here, in case the page closes first.
// Everything else goes to the network untouched.
"use strict";

const POLL_TIMEOUT = 10000; // answer idle polls with [] well before browsers give up on them
const waiting = new Map(); // session -> resolve function of the pending poll
const mailbox = new Map(); // session -> messages that arrived while no poll was pending
const interrupts = new Set(); // sessions with a pending interrupt request
const enginePages = new Set(); // pages running the engine (as opposed to the server)

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim())
);
// asked by pages loaded without the service worker (hard reload, see wasmEngine.ts)
self.addEventListener("message", (event) => {
  if (event.data == "m2wasm-claim") event.waitUntil(self.clients.claim());
});

const json = (body) =>
  new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const poll = function (session) {
  interrupts.delete(session); // Macaulay2 is idle: nothing left to interrupt
  const queued = mailbox.get(session);
  if (queued) {
    mailbox.delete(session);
    return Promise.resolve(json(queued));
  }
  return new Promise((resolve) => {
    const previous = waiting.get(session);
    if (previous) previous([]);
    const done = (messages) => {
      clearTimeout(timeout);
      if (waiting.get(session) === done) waiting.delete(session);
      resolve(json(messages));
    };
    const timeout = setTimeout(() => done([]), POLL_TIMEOUT);
    waiting.set(session, done);
  });
};

const send = async function (session, request) {
  const messages = await request.json();
  const done = waiting.get(session);
  if (done) done(messages);
  else mailbox.set(session, (mailbox.get(session) || []).concat(messages));
  return json(true);
};

// ---- persistent storage. Object store "home": path relative to the home
// directory -> {mtime, data}, data being the contents of a file, or null for a directory.
let database = null; // the connection (a promise)
const openDatabase = () =>
  database ||
  (database = new Promise((resolve, reject) => {
    // one per site: sites on the same domain (user.github.io/...) share IndexedDB
    const request = indexedDB.open("m2wasm " + self.registration.scope, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("home");
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = db.onclose = () => {
        db.close();
        database = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      database = null;
      reject(request.error);
    };
  }));
const transaction = async function (mode, f) {
  const tx = (await openDatabase()).transaction("home", mode);
  const result = f(tx.objectStore("home"));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
};

// exchanged with the worker as a line of JSON listing {path, mtime, size} (a
// file of size bytes), {path, mtime} (a directory) or {path} (deleted),
// followed by the contents of the files (same format in m2wasm-worker.js)
const pack = (entries) =>
  new Blob([
    JSON.stringify(
      entries.map(({ path, mtime, data }) =>
        data ? { path, mtime, size: data.length } : { path, mtime }
      )
    ) + "\n",
    ...entries.filter((e) => e.data).map((e) => e.data),
  ]);
const unpack = async function (body) {
  const bytes = new Uint8Array(await body.arrayBuffer());
  const newline = bytes.indexOf(10);
  let offset = newline + 1;
  return JSON.parse(new TextDecoder().decode(bytes.subarray(0, newline))).map(
    ({ path, mtime, size }) => ({
      path,
      mtime,
      data:
        size >= 0
          ? bytes.slice(offset, (offset += size))
          : mtime === undefined
          ? undefined
          : null,
    })
  );
};

const loadFiles = async function () {
  const requests = await transaction("readonly", (store) => ({
    paths: store.getAllKeys(),
    values: store.getAll(),
  }));
  const entries = requests.paths.result.map((path, i) =>
    Object.assign({ path }, requests.values.result[i])
  );
  return new Response(pack(entries), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-store",
    },
  });
};

const saveFiles = (entries) =>
  transaction("readwrite", (store) =>
    entries.forEach(({ path, mtime, data }) =>
      data === undefined ? store.delete(path) : store.put({ mtime, data }, path)
    )
  );

// uploads as the page writes them (see wasmEngine.ts), except archives and
// unusual paths, which are left to the worker
const saveUploads = async function (fields, files) {
  if (fields.tutorial || fields.githubUser) return;
  const entries = [];
  for (const file of files) {
    if (/\.(tar\.gz|tgz|tar)$/.test(file.name)) continue;
    const name = file.name.replace(/^\/home\/web_user\//, ""); // the home directory, see wasmEngine.ts
    if (name.startsWith("/") || /(^|\/)\.\.(\/|$)/.test(name)) continue;
    const path = name
      .split("/")
      .filter((p) => p && p != ".")
      .join("/");
    if (path)
      entries.push({
        path,
        mtime: Date.now(),
        data: new Uint8Array(file.data),
      });
  }
  if (entries.length > 0) await saveFiles(entries);
};

// ask a page; it first acknowledges ({handled: false} if it has no engine), then answers
const ask = (client, msg) =>
  new Promise((resolve) => {
    const channel = new MessageChannel();
    let timeout = setTimeout(() => resolve(null), 3000);
    channel.port1.onmessage = (e) => {
      clearTimeout(timeout);
      if (e.data && e.data.pending)
        timeout = setTimeout(() => resolve(null), 120000);
      else resolve(e.data);
    };
    client.postMessage(msg, [channel.port2]);
  });

const upload = async function (event) {
  const request = event.request.clone(); // in case no page handles it
  const client = event.clientId && (await self.clients.get(event.clientId));
  const engine = enginePages.has(event.clientId);
  if (client || engine) {
    const fields = {},
      files = [];
    for (const [key, value] of await event.request.formData())
      if (typeof value == "string") fields[key] = value;
      else files.push({ name: value.name, data: await value.arrayBuffer() });
    // also when the page is gone, e.g. the editor's last save, sent while closing
    if (engine) await saveUploads(fields, files).catch(console.warn);
    const reply =
      client && (await ask(client, { type: "m2wasm-upload", fields, files }));
    if (reply && reply.handled !== false)
      return new Response(reply.text || "", {
        status: reply.status || 200,
        headers: { "Content-Type": "text/html" },
      });
  }
  return fetch(request);
};

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const m = /\/__m2wasm__\/(\w+)$/.exec(url.pathname);
  if (m) {
    const session = url.searchParams.get("session") || "";
    const action = m[1];
    if (action == "poll") event.respondWith(poll(session));
    else if (action == "send") {
      enginePages.add(event.clientId);
      event.respondWith(send(session, event.request));
    } else if (action == "files") event.respondWith(loadFiles());
    else if (action == "save")
      event.respondWith(
        unpack(event.request)
          .then(saveFiles)
          .then(() => json(true))
      );
    else if (action == "interrupt") {
      interrupts.add(session);
      event.respondWith(json(true));
    } else if (action == "check")
      event.respondWith(json(interrupts.delete(session)));
  } else if (
    event.request.method == "POST" &&
    /\/upload\/?$/.test(url.pathname)
  )
    event.respondWith(upload(event));
});
