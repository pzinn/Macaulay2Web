/* eslint-env worker */
// Macaulay2Web -- WebAssembly engine, worker side (see src/client/wasmEngine.ts).
//
// Runs the emscripten-forge build of Macaulay2
// (https://prefix.dev/channels/emscripten-forge-4x/packages/macaulay2, installed
// in m2wasm/ by ./fetch-m2wasm) as "M2 --webapp", the same program the server runs.
//   worker -> page (postMessage): {type: "output", data}, {type: "idle"},
//     {type: "fs", id, result, error}, {type: "exit", code}, {type: "error", message}
//   page -> worker: {type: "start", ...} once; afterwards the worker is blocked
//     inside Macaulay2, so everything else (input, file requests) is fetched
//     synchronously from the service worker (m2wasm-sw.js), as arrays of
//     {t: "in", d: text} and {t: "fs", id, op, path, data}.
// The home directory is kept by the service worker: restored before Macaulay2
// starts, and saved whenever Macaulay2 waits for input.
// (Everything is in a closure: M2-binary.js, loaded with importScripts, uses the global scope.)
(() => {
  "use strict";

  let channel, session, home;
  let started = false; // reached the first prompt
  let exports_ = null; // the wasm exports
  const decoder = new TextDecoder(); // stream mode: UTF-8 sequences may be split across writes
  const encoder = new TextEncoder();
  let pending = new Uint8Array(0); // stdin bytes not yet consumed by Macaulay2

  const post = (msg) => self.postMessage(msg);

  // ---- output (stdout and stderr), posted in batches
  let outBuffer = "";
  let lastPost = 0;
  const flushOutput = function () {
    if (outBuffer) post({ type: "output", data: outBuffer });
    outBuffer = "";
    lastPost = performance.now();
  };
  let burst = 0; // number of posts in the current 50ms window
  const writeOutput = function (bytes) {
    outBuffer += decoder.decode(bytes, { stream: true });
    // post at once, unless output floods in (then batch, every 50ms)
    const now = performance.now();
    if (now - lastPost > 50) burst = 0;
    if (++burst <= 20 || now - lastPost > 50 || outBuffer.length > 65536)
      flushOutput();
  };

  // ---- file system requests from the page (editor, uploads)
  const removeTree = function (FS, dir) {
    for (const name of FS.readdir(dir))
      if (name != "." && name != "..") {
        const path = dir + "/" + name;
        if (FS.isDir(FS.lstat(path).mode)) removeTree(FS, path);
        else FS.unlink(path);
      }
    FS.rmdir(dir);
  };
  const fsRequest = function (FS, op, path, data) {
    const stat = (p) => {
      try {
        return FS.stat(p);
      } catch (e) {
        return null;
      }
    };
    const st = stat(path);
    if (op == "stat") {
      // -> null (missing), {dir: [entries]} or {text, readonly}
      if (!st) return null;
      if (FS.isDir(st.mode))
        return {
          dir: FS.readdir(path).map((x) => {
            const s = stat(path + "/" + x);
            return x + (s && FS.isDir(s.mode) ? "/" : "");
          }),
        };
      if (!FS.isFile(st.mode)) return null;
      return {
        text: FS.readFile(path, { encoding: "utf8" }),
        readonly: !(st.mode & 128),
      };
    }
    if (op == "mkdir") {
      FS.mkdirTree(path);
      return true;
    }
    if (op == "write") {
      // data: text, or {b64: base64-encoded binary}
      const dir = path.substring(0, path.lastIndexOf("/"));
      if (dir) FS.mkdirTree(dir);
      FS.writeFile(
        path,
        typeof data == "string"
          ? data
          : Uint8Array.from(atob(data.b64), (c) => c.charCodeAt(0))
      );
      return true;
    }
    if (op == "delete") {
      if (!st) return "File does not exist.";
      if (FS.isDir(st.mode)) {
        // in the home directory, with its contents (they are kept otherwise)
        const dir = FS.lookupPath(path).path;
        if (dir.startsWith(home + "/")) removeTree(FS, dir);
        else FS.rmdir(path);
      } else if (FS.isFile(st.mode)) FS.unlink(path);
      else return "Only regular files and empty directories can be deleted.";
      return true;
    }
    throw new Error("unknown request " + op);
  };

  const handleMessages = function (messages) {
    for (const msg of messages) {
      if (msg.t == "in") {
        const bytes = encoder.encode(msg.d);
        const merged = new Uint8Array(pending.length + bytes.length);
        merged.set(pending);
        merged.set(bytes, pending.length);
        pending = merged;
      } else if (msg.t == "fs") {
        let result, error;
        try {
          result = fsRequest(self.Module.FS, msg.op, msg.path, msg.data);
        } catch (e) {
          error = String((e && e.message) || e);
          // the service worker may have stored this upload already: let the
          // next save put back what really is there
          if (saved && msg.op == "write" && msg.path.startsWith(home + "/"))
            saved.set(
              msg.path
                .substring(home.length + 1)
                .split("/")
                .filter((p) => p && p != ".")
                .join("/"),
              null
            );
        }
        post({ type: "fs", id: msg.id, result, error });
      }
    }
  };

  // ---- persistent storage of the home directory (see m2wasm-sw.js)
  // what was last saved: path (relative to home) -> "mtime size inode" for a
  // file, "" for a directory; null when there is no storage
  let saved = null;
  const scanHome = function (FS) {
    const result = new Map();
    const scan = function (dir, prefix) {
      for (const name of FS.readdir(dir)) {
        if (name == "." || name == "..") continue;
        const st = FS.lstat(dir + "/" + name);
        if (FS.isDir(st.mode)) {
          result.set(prefix + name, "");
          scan(dir + "/" + name, prefix + name + "/");
        } else if (FS.isFile(st.mode))
          result.set(prefix + name, +st.mtime + " " + st.size + " " + st.ino);
      }
    };
    scan(home, "");
    return result;
  };

  // same format as in m2wasm-sw.js
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
        data: size >= 0 ? bytes.slice(offset, (offset += size)) : null,
      })
    );
  };

  const loadFiles = async function () {
    try {
      const response = await fetch(channel + "files");
      if (
        response.ok &&
        response.headers.get("Content-Type") == "application/octet-stream"
      )
        return await unpack(response);
    } catch (e) {
      // no storage: the files only live as long as Macaulay2
    }
    return null;
  };

  const restoreFiles = function (FS, entries) {
    const failed = [];
    for (const { path, mtime, data } of entries) {
      const fullPath = home + "/" + path;
      try {
        if (data) {
          FS.mkdirTree(fullPath.substring(0, fullPath.lastIndexOf("/")));
          FS.writeFile(fullPath, data);
        } else FS.mkdirTree(fullPath);
        FS.utime(fullPath, mtime, mtime);
      } catch (e) {
        console.warn("could not restore " + fullPath, e);
        failed.push(path);
      }
    }
    saved = scanHome(FS);
    failed.forEach((path) => saved.set(path, null)); // corrected at the first save
  };

  let saveFailed = false;
  const saveChanges = function () {
    if (!saved) return;
    try {
      const FS = self.Module.FS;
      const current = scanHome(FS);
      const entries = [];
      for (const [path, stamp] of current)
        if (saved.get(path) !== stamp) {
          const fullPath = home + "/" + path;
          entries.push({
            path,
            mtime: +FS.stat(fullPath).mtime,
            data: stamp ? FS.readFile(fullPath) : null,
          });
        }
      for (const path of saved.keys())
        if (!current.has(path)) entries.push({ path });
      if (entries.length > 0) {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", channel + "save", false);
        xhr.send(pack(entries));
        if (xhr.status != 200) throw new Error("HTTP " + xhr.status);
      }
      saved = current; // only once stored: otherwise, sent again next time
      saveFailed = false;
    } catch (e) {
      console.warn("could not save files", e);
      if (!saveFailed)
        post({
          type: "warning",
          message:
            "Your files could not be saved in the browser's storage; trying again at the next prompt.",
        });
      saveFailed = true;
    }
  };

  const syncGet = function (what) {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "GET",
      channel + what + "?session=" + encodeURIComponent(session),
      false
    );
    xhr.send(null);
    if (
      xhr.status != 200 ||
      !/json/.test(xhr.getResponseHeader("Content-Type"))
    )
      throw new Error("no answer from the service worker");
    return JSON.parse(xhr.responseText);
  };

  // blocks until the page sends something
  const waitForMessages = function () {
    started = true;
    flushOutput();
    post({ type: "idle" });
    saveChanges();
    for (;;) {
      let messages;
      try {
        messages = syncGet("poll");
      } catch (e) {
        // the service worker may have been restarted mid-poll: try again, but not forever
        try {
          messages = syncGet("poll");
        } catch (e) {
          post({
            type: "error",
            message: "lost connection to the service worker",
          });
          throw e;
        }
      }
      if (messages.length > 0) return handleMessages(messages);
    }
  };

  const readInput = function (buffer, offset, length) {
    while (pending.length == 0) waitForMessages();
    const n = Math.min(length, pending.length);
    buffer.set(pending.subarray(0, n), offset);
    pending = pending.subarray(n);
    return n;
  };

  // ---- the terminal: replaces emscripten's /dev/tty (stdin, stdout) and /dev/tty1 (stderr)
  const tty = {
    ops: {
      // like the server's "stty -icanon -echo": M2 --webapp echoes input itself
      ioctl_tcgets: () => ({
        c_iflag: 25856,
        c_oflag: 5,
        c_cflag: 191,
        c_lflag: 35377,
        c_cc: [3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22],
      }),
      ioctl_tcsets: () => 0,
      ioctl_tiocgwinsz: () => [24, 80],
    },
  };
  const ttyOps = {
    open(stream) {
      stream.tty = tty;
      stream.seekable = false;
    },
    close() {},
    fsync() {},
    read(stream, buffer, offset, length) {
      return readInput(buffer, offset, length);
    },
    write(stream, buffer, offset, length) {
      writeOutput(buffer.subarray(offset, offset + length));
      return length;
    },
  };

  // ---- signals. Macaulay2 runs synchronously and never yields to the event
  // loop, so the page cannot signal it directly, and setTimeout-based timers
  // (alarm) never fire. Instead, whenever Macaulay2 calls into JavaScript, we
  // check for expired timers and (at most every 200ms) for an interrupt request
  // from the page; either raises SIGALRM, which Macaulay2 treats as an interrupt.
  // Reading input and writing output are left alone, so that a late signal
  // cannot hit the next input line.
  const timers = [0, 0, 0]; // deadlines of setitimer(ITIMER_REAL/VIRTUAL/PROF)
  const unhooked = new Set([
    "fd_read",
    "fd_write",
    "__syscall_ioctl",
    "__call_sighandler",
    "_abort_js",
    "proc_exit",
    "exit",
  ]);
  let nextCheck = 0;
  let hooking = false;
  const hook = function () {
    if (!exports_ || hooking) return;
    hooking = true;
    try {
      const now = performance.now();
      if (outBuffer && now - lastPost > 50) flushOutput();
      if (!started) return;
      for (let which = 0; which < 3; which++)
        if (timers[which] && now >= timers[which]) {
          timers[which] = 0;
          exports_._emscripten_timeout(which, now);
        }
      if (now >= nextCheck) {
        nextCheck = now + 200;
        let interrupt = false;
        try {
          interrupt = syncGet("check");
        } catch (e) {
          // ignore
        }
        if (interrupt) exports_._emscripten_timeout(0, now); // SIGALRM
      }
    } finally {
      hooking = false;
    }
  };
  const wrapImports = function (imports) {
    const done = new Set();
    for (const mod of Object.values(imports)) {
      if (done.has(mod)) continue; // env and wasi_snapshot_preview1 may be the same object
      done.add(mod);
      for (const name of Object.keys(mod)) {
        const f = mod[name];
        if (typeof f != "function" || unhooked.has(name)) continue;
        mod[name] =
          name == "_setitimer_js"
            ? (which, ms) => {
                timers[which] = ms ? performance.now() + ms : 0;
                return 0;
              }
            : function () {
                hook();
                return f.apply(this, arguments);
              };
      }
    }
  };

  // fetch an asset, preferably its gzipped version (GitHub Pages does not compress .wasm/.data)
  const fetchAsset = async function (url) {
    let response = await fetch(url + ".gz");
    if (!response.ok) response = await fetch(url);
    if (!response.ok)
      throw new Error("could not load " + url + " (" + response.status + ")");
    let buffer = await response.arrayBuffer();
    const head = new Uint8Array(buffer, 0, 2);
    if (head[0] == 0x1f && head[1] == 0x8b)
      // not already decompressed by the browser
      buffer = await new Response(
        new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"))
      ).arrayBuffer();
    return buffer;
  };

  self.onmessage = async function (e) {
    if (e.data.type != "start") return;
    self.onmessage = null;
    ({ channel, session, home } = e.data);
    const assets = e.data.assets;
    try {
      const [wasm, data, files] = await Promise.all([
        fetchAsset(assets + "M2-binary.wasm"),
        fetchAsset(assets + "M2.data"),
        loadFiles(),
      ]);
      self.Module = {
        thisProgram: "/m2/bin/M2-binary", // M2 finds /m2/share/Macaulay2 relative to this
        arguments: ["--webapp"],
        getPreloadedPackage: () => data,
        instantiateWasm(imports, receive) {
          wrapImports(imports);
          WebAssembly.instantiate(wasm, imports).then(
            (result) => {
              exports_ = result.instance.exports;
              receive(result.instance, result.module);
            },
            (err) => post({ type: "error", message: String(err) })
          );
          return {};
        },
        preRun: [
          () => {
            const FS = self.Module.FS;
            FS.registerDevice(FS.makedev(5, 0), ttyOps); // /dev/tty: stdin, stdout
            FS.registerDevice(FS.makedev(6, 0), ttyOps); // /dev/tty1: stderr
            FS.mkdirTree(home);
            self.Module.ENV.HOME = home;
            FS.chdir(home);
            if (files) restoreFiles(FS, files);
          },
        ],
        print: (s) => console.log(s),
        printErr: (s) => console.warn(s),
        onExit: (code) => {
          flushOutput();
          saveChanges();
          post({ type: "exit", code });
        },
        onAbort: (what) => {
          flushOutput();
          saveChanges();
          post({ type: "error", message: String(what) });
        },
      };
      importScripts(assets + "M2.data.js", assets + "M2-binary.js");
    } catch (err) {
      post({ type: "error", message: String((err && err.message) || err) });
    }
  };
})();
