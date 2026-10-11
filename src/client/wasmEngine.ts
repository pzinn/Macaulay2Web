/* eslint-env browser */
// Macaulay2Web -- WebAssembly engine (page side).
//
// An alternative to the Macaulay2 server: Macaulay2 compiled to WebAssembly
// (emscripten-forge package "macaulay2", installed in public/m2wasm/ by
// ./fetch-m2wasm) runs in a web worker (public/m2wasm-worker.js) as
// "M2 --webapp", and WasmSocket below impersonates the socket.io connection to
// the server, so the rest of the client is unchanged. A service worker
// (public/m2wasm-sw.js) carries input to the worker and handles uploads.
// Nothing but static files is needed, e.g. GitHub Pages.
//
// The engine is chosen with ?engine=wasm or ?engine=server in the URL; the
// default is set at build time (webpack --env wasm, see package.json).

import { webAppTags } from "../common/tags";

declare const DEFAULT_ENGINE: string;

const engineParam = new URL(document.location.href).searchParams.get("engine");
const useWasmEngine =
  (engineParam ||
    (typeof DEFAULT_ENGINE !== "undefined" ? DEFAULT_ENGINE : "server")) ===
  "wasm";

const home = "/home/web_user"; // Macaulay2's home directory, where user files go
const base = new URL(".", document.baseURI).href; // the site, e.g. https://user.github.io/Macaulay2Web/
const channel = base + "__m2wasm__/"; // see m2wasm-sw.js

const escapeHTML = (s: string) =>
  s.replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
// same format as the server's messages when M2 dies
const errorOutput = (msg: string) =>
  webAppTags.Html +
  '<div class="M2Error">' +
  escapeHTML(msg) +
  "</div>" +
  webAppTags.End +
  webAppTags.CellEnd +
  webAppTags.CellEnd;

const randomId = () => Math.random().toString(36).slice(2, 10);

const toBase64 = function (bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

const resolvePath = (name: string) =>
  name.startsWith("/") ? name : home + "/" + name;

// minimal (gzipped) tar reader, for uploads of .tar.gz files
const untar = async function (buffer: ArrayBuffer) {
  let bytes = new Uint8Array(buffer);
  if (bytes[0] == 0x1f && bytes[1] == 0x8b)
    bytes = new Uint8Array(
      await new Response(
        new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))
      ).arrayBuffer()
    );
  const decoder = new TextDecoder();
  const str = (b: Uint8Array) => decoder.decode(b).replace(/\0[^]*$/, "");
  const field = (o: number, n: number) => str(bytes.subarray(o, o + n));
  const entries: { name: string; data: Uint8Array | null }[] = [];
  let longName = null;
  for (let o = 0; o + 512 <= bytes.length; ) {
    const name = field(o, 100);
    if (!name) break;
    const size = parseInt(field(o + 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(bytes[o + 156]);
    const prefix = field(o + 257, 6) == "ustar" ? field(o + 345, 155) : "";
    const data = bytes.subarray(o + 512, o + 512 + size);
    o += 512 + Math.ceil(size / 512) * 512;
    if (type == "L") longName = str(data);
    else if (type == "x") {
      const m = /\d+ path=([^\n]*)\n/.exec(decoder.decode(data));
      if (m) longName = m[1];
    } else if (type == "0" || type == "\0" || type == "5") {
      const path = (longName || (prefix ? prefix + "/" : "") + name).replace(
        /^\/+/,
        ""
      );
      entries.push({ name: path, data: type == "5" ? null : data });
      longName = null;
    } else longName = null; // links, global headers... are ignored
  }
  return entries;
};

// GitHub repositories: codeload.github.com (tarballs) does not allow CORS,
// so list the tree with the GitHub API and fetch files from raw.githubusercontent.com
const githubFiles = async function (
  user: string,
  project: string,
  ref: string
) {
  const repo = encodeURIComponent(user) + "/" + encodeURIComponent(project);
  const response = await fetch(
    "https://api.github.com/repos/" +
      repo +
      "/git/trees/" +
      encodeURIComponent(ref) +
      "?recursive=1"
  );
  if (!response.ok)
    throw new Error("GitHub download failed (HTTP " + response.status + ").");
  const blobs = (await response.json()).tree.filter((x) => x.type == "blob");
  if (blobs.length > 2000) throw new Error("GitHub repository too large.");
  const dir = user + "-" + project + "-" + ref + "/";
  const files = [];
  for (let i = 0; i < blobs.length; i += 16)
    await Promise.all(
      blobs.slice(i, i + 16).map(async (blob) => {
        const r = await fetch(
          "https://raw.githubusercontent.com/" +
            repo +
            "/" +
            encodeURIComponent(ref) +
            "/" +
            blob.path.split("/").map(encodeURIComponent).join("/")
        );
        if (!r.ok) throw new Error("GitHub download failed: " + blob.path);
        files.push({
          name: dir + blob.path,
          data: new Uint8Array(await r.arrayBuffer()),
        });
      })
    );
  return { dir, files };
};

let swReady: Promise<void> | null = null;
const serviceWorkerReady = function () {
  if (!swReady)
    swReady = (async () => {
      if (!("serviceWorker" in navigator))
        throw new Error(
          "service workers are not available (private browsing?)"
        );
      const registration = await navigator.serviceWorker.register(
        base + "m2wasm-sw.js"
      );
      await navigator.serviceWorker.ready;
      // a running engine keeps the service worker busy, which defers its
      // updates: look for one now, and let it take over before starting (once
      // the previous page's last input poll is over, see m2wasm-sw.js)
      const stale = registration.waiting; // found earlier, still blocked by another tab
      await registration.update().catch(() => null);
      const update = registration.installing || registration.waiting;
      if (update && update !== stale)
        await new Promise((resolve) => {
          navigator.serviceWorker.addEventListener("controllerchange", resolve);
          setTimeout(resolve, 11000);
        });
      if (!navigator.serviceWorker.controller)
        await new Promise((resolve, reject) => {
          navigator.serviceWorker.addEventListener("controllerchange", resolve);
          // e.g. after a hard reload, which bypasses the service worker
          if (registration.active)
            registration.active.postMessage("m2wasm-claim");
          setTimeout(
            () =>
              navigator.serviceWorker.controller
                ? resolve(null)
                : reject(new Error("please reload the page")),
            5000
          );
        });
    })().catch((err) => {
      swReady = null; // so that Reset tries again
      throw err;
    });
  return swReady;
};

type Handler = (...args: any[]) => void;

class WasmSocket {
  connected = false;
  disconnected = true;
  oldEmit: any; // set by main.ts
  private handlers: { [event: string]: Handler[] } = {};
  private worker: Worker | null = null;
  private generation = 0; // to ignore late events from a stopped engine
  private alive = false; // an engine is starting or running
  private started = false; // Macaulay2 reached its first prompt
  private idle = false; // Macaulay2 waits for input
  private session = "";
  private queue = []; // messages for the worker, sent when it is idle
  private requests = new Map<number, (result, error?) => void>();
  private requestCounter = 0;
  private interruptTime = 0; // time of a pending interrupt request
  private interruptTimeout = 0;
  private chatCounter = 0;
  // state of the output translation, see translate()
  private inInput = false;
  private inPosition = false;
  private readReply = false;
  private lastPrompt = "";
  private held = "";

  constructor(private clientId: string) {}

  on(event: string, handler: Handler) {
    (this.handlers[event] = this.handlers[event] || []).push(handler);
    return this;
  }

  private fire(event: string, ...args) {
    (this.handlers[event] || []).forEach((handler) => handler(...args));
  }

  connect() {
    if (this.connected) return this;
    this.connected = true;
    this.disconnected = false;
    if (!this.clientId) this.clientId = randomId();
    setTimeout(() => {
      this.fire("connect");
      this.fire("instance", this.clientId);
    });
    this.startEngine();
    return this;
  }

  emit(event: string, ...args) {
    const callback = args[args.length - 1];
    if (event == "input") {
      if (args[0] == "\x03") this.interrupt();
      else this.send({ t: "in", d: args[0] });
    } else if (event == "completion-request")
      // upstream Macaulay2 has no completion protocol: the client then uses its static symbol list
      setTimeout(() =>
        this.fire("completion-response", { id: args[0].id, completions: null })
      );
    else if (event == "reset") {
      this.systemChat("Resetting M2.");
      this.startEngine();
    } else if (event == "chat") this.chat(args[0]);
    else if (event == "fileexists") this.fileExists(args[0]).then(callback);
    else if (event == "deletefile")
      this.fsRequest("delete", resolvePath(args[0])).then((result) =>
        result === true
          ? callback("Deleted " + args[0] + ".", false)
          : callback(result || "Delete failed.", true)
      );
    // "restore": no output to restore, the engine lives and dies with the page
    return this;
  }

  // ---- the engine

  private startEngine() {
    this.stopEngine();
    const generation = this.generation;
    this.alive = true;
    this.session = randomId();
    this.fire("output", "Loading Macaulay2 (WebAssembly)...\n");
    serviceWorkerReady().then(
      () => {
        if (generation != this.generation) return;
        const worker = (this.worker = new Worker(base + "m2wasm-worker.js"));
        worker.onmessage = (e) => {
          if (generation == this.generation) this.fromWorker(e.data);
        };
        worker.onerror = (e) => {
          e.preventDefault();
          if (generation == this.generation) this.crash(e.message);
        };
        worker.postMessage({
          type: "start",
          session: this.session,
          assets: base + "m2wasm/",
          channel,
          home,
        });
      },
      (err) => {
        if (generation == this.generation)
          this.crash("could not start the WebAssembly engine: " + err.message);
      }
    );
  }

  private stopEngine() {
    this.generation++;
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.alive = this.started = this.idle = false;
    this.queue.length = 0;
    this.requests.forEach((callback) => callback(null, "stopped"));
    this.requests.clear();
    this.interruptTime = 0;
    clearTimeout(this.interruptTimeout);
    this.inInput = this.inPosition = this.readReply = false;
    this.lastPrompt = this.held = "";
  }

  private crash(msg: string) {
    this.stopEngine();
    this.fire(
      "output",
      errorOutput(
        "Macaulay2 exited unexpectedly (" +
          msg +
          "). Press Reset to start a fresh process."
      )
    );
  }

  private fromWorker(msg) {
    if (msg.type == "output") {
      let data = this.translate(msg.data);
      if (this.interruptTime)
        data = data.replace(/alarm occurred/g, "interrupted");
      if (data) this.fire("output", data);
    } else if (msg.type == "idle") {
      if (this.held) this.fire("output", this.held);
      this.held = "";
      this.started = this.idle = true;
      this.interruptTime = 0;
      clearTimeout(this.interruptTimeout);
      this.flush();
    } else if (msg.type == "fs") {
      const callback = this.requests.get(msg.id);
      this.requests.delete(msg.id);
      if (callback) callback(msg.result, msg.error);
    } else if (msg.type == "exit") {
      // like the server: say nothing about a normal exit, restart on the next input
      const end = this.held + webAppTags.CellEnd + webAppTags.CellEnd;
      this.stopEngine();
      if (msg.code === 0) this.fire("output", end);
      else
        this.fire(
          "output",
          errorOutput(
            "Macaulay2 exited unexpectedly with exit code " +
              msg.code +
              ". Press Reset to start a fresh process."
          )
        );
    } else if (msg.type == "error") this.crash(msg.message);
    else if (msg.type == "warning") this.systemChat(msg.message);
  }

  private send(msg) {
    if (!this.alive) this.startEngine();
    this.queue.push(msg);
    this.flush();
  }

  private flush() {
    if (!this.idle || this.queue.length == 0) return;
    this.idle = false;
    // input that does not follow a prompt is a reply to read()
    if (!this.inInput && this.queue.some((msg) => msg.t == "in"))
      this.readReply = true;
    fetch(channel + "send?session=" + this.session, {
      method: "POST",
      body: JSON.stringify(this.queue.splice(0)),
    }).catch((err) => this.crash(err.message));
  }

  // The emscripten-forge package is the upstream Macaulay2, whose WebApp output
  // lacks a few tags that the client expects (they come from the Macaulay2 the
  // server runs, https://github.com/pzinn/M2): add InputEnd after each echoed
  // input line, InputDiscarded when input was flushed after a parsing error
  // (recognizable as the prompt is then repeated), and Input before replies to read().
  private translate(data: string) {
    let s = this.held + data;
    const incomplete = /\x14(\x13(\x0e[^\x12]*)?)?$/.exec(s); // hold back a partial prompt
    this.held = incomplete ? s.substring(incomplete.index) : "";
    if (incomplete) s = s.substring(0, incomplete.index);
    s = s.replace(/\x14\x13\x0e([^\x12]*)\x12/g, (prompt, label) => {
      const discarded = label == this.lastPrompt;
      this.lastPrompt = label;
      return (discarded ? webAppTags.InputDiscarded : "") + prompt;
    });
    if (this.readReply && s) {
      s = webAppTags.Input + s;
      this.readReply = false;
    }
    if (!this.inInput && !/[\x1c\x1d]/.test(s)) return s;
    let out = "";
    for (const c of s) {
      out += c;
      if (c == webAppTags.Input || c == webAppTags.InputContd)
        this.inInput = true;
      else if (c == webAppTags.Position) this.inPosition = true;
      else if (c == webAppTags.End) this.inPosition = false;
      else if (c == "\n" && this.inInput && !this.inPosition) {
        out += webAppTags.InputEnd;
        this.inInput = false;
      } else if (c < " " && c != "\t") this.inInput = false; // some other tag
    }
    return out;
  }

  // Macaulay2 cannot be signalled while it computes: the worker checks for
  // interrupt requests whenever Macaulay2 calls into JavaScript (frequent, but
  // not guaranteed). Interrupting again after a while restarts Macaulay2.
  private interrupt() {
    if (!this.started || this.idle) return;
    if (!this.interruptTime) {
      this.interruptTime = Date.now();
      fetch(channel + "interrupt?session=" + this.session, {
        method: "POST",
      }).catch(() => null);
      this.interruptTimeout = window.setTimeout(
        () =>
          this.fire(
            "output",
            "\n-- Macaulay2 is not responding; interrupt again to restart it\n"
          ),
        5000
      );
    } else if (Date.now() - this.interruptTime > 1000) {
      this.stopEngine();
      this.fire(
        "output",
        errorOutput("Macaulay2 could not be interrupted and was restarted.")
      );
      this.startEngine();
    }
  }

  // ---- files: the editor and uploads read and write the engine's file system

  private fsRequest(op: string, path: string, data?) {
    return new Promise<any>((resolve) => {
      const id = ++this.requestCounter;
      this.send({ t: "fs", id, op, path, data });
      this.requests.set(id, (result, error) => resolve(error ? null : result));
    });
  }

  private async fileExists(fileName: string) {
    // answer like the server: a URL, with "readonly@"/"directory@" markers
    if (fileName.startsWith("tutorials/")) {
      // served by the site
      const response = await fetch(base + fileName, { method: "HEAD" });
      return response.ok ? base + fileName + "#readonly@" : null;
    }
    const result = await this.fsRequest("stat", resolvePath(fileName));
    if (!result) return null;
    const blob = new Blob([result.dir ? result.dir.join("\n") : result.text], {
      type: "text/plain",
    });
    const url = URL.createObjectURL(blob);
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
    return (
      url + (result.dir ? "#directory@" : result.readonly ? "#readonly@" : "")
    );
  }

  async upload(fields, files: { name: string; data: ArrayBuffer }[]) {
    if (fields.tutorial) return { status: 200 }; // already loaded by the page; nothing to keep
    let uploaded = "";
    const failed = [];
    const write = async (name: string, data: Uint8Array | null) => {
      const result = await this.fsRequest(
        data ? "write" : "mkdir",
        resolvePath(name),
        data && { b64: toBase64(data) }
      );
      if (result !== true) failed.push(name);
    };
    if (fields.githubUser) {
      let github;
      try {
        github = await githubFiles(
          fields.githubUser.trim(),
          fields.githubProject.trim(),
          fields.githubBranch.trim()
        );
      } catch (err) {
        return { status: 502, text: escapeHTML(err.message) };
      }
      await Promise.all(
        github.files.map((file) => write(file.name, file.data))
      );
      uploaded = escapeHTML(github.dir) + " (extracted)<br/>";
    }
    for (const file of files) {
      const failures = failed.length;
      if (/\.(tar\.gz|tgz|tar)$/.test(file.name)) {
        const dir = file.name.substring(0, file.name.lastIndexOf("/") + 1);
        await Promise.all(
          (
            await untar(file.data)
          ).map((entry) => write(dir + entry.name, entry.data))
        );
        uploaded += escapeHTML(file.name) + " (extracted)<br/>";
      } else {
        await write(file.name, new Uint8Array(file.data));
        uploaded += escapeHTML(file.name) + "<br/>";
      }
      if (failed.length == failures)
        this.fire("filechanged", { fileName: file.name, hash: fields.hash });
    }
    // (written once Macaulay2 waits for input: an upload during a computation waits for it)
    if (failed.length > 0)
      return {
        status: 500,
        text:
          "The following files could not be written:<br/><b>" +
          failed.map(escapeHTML).join("<br/>") +
          "</b>",
      };
    return {
      status: 200,
      text: fields.noreply
        ? ""
        : "The following files have been uploaded and can be used in your session:<br/><b>" +
          uploaded +
          "</b>",
    };
  }

  // ---- chat: no other users, so just echo

  private systemChat(message: string) {
    this.fire("chat", {
      type: "message",
      alias: "System",
      message,
      time: Date.now(),
      index: this.chatCounter++,
    });
  }

  private chat(msg) {
    if (msg.type == "message")
      this.fire(
        "chat",
        Object.assign({}, msg, { index: this.chatCounter++, recipients: null })
      );
    else if (msg.type == "restore" && msg.index < 0)
      this.systemChat(
        "Welcome " + msg.alias + " (user id " + this.clientId + ") !"
      );
  }
}

let activeSocket: WasmSocket | null = null;
const wasmSocket = function (clientId: string) {
  return (activeSocket = new WasmSocket(clientId));
};

// uploads intercepted by the service worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (!e.data || e.data.type != "m2wasm-upload" || !e.ports[0]) return;
    const port = e.ports[0];
    if (!activeSocket) {
      port.postMessage({ handled: false });
      return;
    }
    port.postMessage({ pending: true });
    activeSocket.upload(e.data.fields, e.data.files).then(
      (reply) => port.postMessage(reply),
      (err) => port.postMessage({ status: 500, text: escapeHTML(String(err)) })
    );
  });
  navigator.serviceWorker.startMessages();
}

if (useWasmEngine) serviceWorkerReady().catch(() => null); // get it ready early

export { useWasmEngine, wasmSocket };
