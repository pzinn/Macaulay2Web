# Macaulay2Web - a Web App for Macaulay2

Macaulay2Web is a browser interface for [Macaulay2](https://macaulay2.com/).
It provides an interactive Macaulay2 terminal, tutorials, an editor, a chat panel, and a documentation/browser pane.

The public instance currently runs at <https://www.unimelb-macaulay2.cloud.edu.au/>.

## Overview

Macaulay2Web has a server/client structure:

* The client runs in the browser.
* The server creates or reconnects to one Macaulay2 process per user.
* In the recommended setup, each user process runs inside a Docker container.
* Macaulay2 runs in WebApp mode, which emits structured output that the client renders as HTML/KaTeX instead of plain terminal text.

Users are identified by cookies or by an explicit `?user=...` URL parameter. Returning users can reconnect to an existing session when its container is still available.

## Quickstart

Recommended local setup uses Docker containers. You need Git, Node.js, npm, Docker, and SSH tooling.

```bash
git clone https://github.com/pzinn/Macaulay2Web.git
cd Macaulay2Web
git submodule update --init
npm install
ssh-keygen -b 1024 -f id_rsa -P ''
docker pull pzinn/m2container
docker build -t m2container .
npm run docker
```

Then open <http://localhost:8002>.

The `npm install` step runs `postinstall`, which downloads the VectorGraphics client files, links KaTeX fonts under `public/fonts/KaTeX`, and adjusts tutorial file permissions.

## Server Modes

The server entry point is `src/server/index.ts`, built to `dist/server/index.js`.

Common modes:

* `npm run docker`: build everything and start the standard Docker-backed server.
* `npm run new`: build everything and start the newer Docker-backed mode that connects to containers via Docker bridge IPs rather than published SSH ports.
* `npm run local`: build everything and run Macaulay2 locally without Docker. This is insecure except on a trusted development machine.
* `npm start docker`: start the already-built server in Docker mode.
* `npm start docker 8002`: start the already-built server on a specific HTTP port.

The default local server is plain HTTP on port `8002`.

## WebAssembly Engine

Instead of a Macaulay2 server, the client can run Macaulay2 compiled to WebAssembly in the browser: the [emscripten-forge `macaulay2-vanilla` package](https://prefix.dev/channels/emscripten-forge-4x/packages/macaulay2-vanilla) runs in a web worker as `M2 --webapp`, and the interface is unchanged. Only static files are needed, so this works on GitHub Pages.

Guide for GitHub Pages Deployment:

Clone the repository with `--recursive`.

```bash
npm install
npm run build:wasm
cp -rL public _site
touch _site/.nojekyll
```

Then publish `_site` to desired branches (e.g. gh-pages).

* `./fetch-m2wasm [version]` installs the package with micromamba (downloaded if missing) into `public/m2wasm/`, gzipped.
* The engine is chosen with `?engine=wasm` or `?engine=server`; the default is set at build time (`webpack --env wasm`). A server installation can therefore also offer the WebAssembly engine, after `./fetch-m2wasm`.

| Build command | Default engine |
| --- | --- |
| `npm run build`, `docker`, `new`, `local`, `ssh`, `debug`) | server |
| `npm run build:client`, `build:minimal`, `build:tutorial` | server |
| `npm run build:debug`, `build:debug-minimal`, `build:debug-tutorial` | server |
| `npm run build:wasm` | wasm |
| any `webpack` command with `--env wasm` added | wasm |
* `.github/workflows/deploy-wasm.yml` builds and deploys the site to GitHub Pages.

How it works: `src/client/wasmEngine.ts` replaces the socket.io connection with an object that speaks the same events, `public/m2wasm-worker.js` runs Macaulay2, and the service worker `public/m2wasm-sw.js` passes input to it (Macaulay2 reads its input synchronously, and SharedArrayBuffer would require cross-origin isolation headers, which GitHub Pages cannot set), handles uploads and keeps the files. Differences with the server:

* Files live in the browser (home directory `/home/web_user`). They are kept in the browser's storage (IndexedDB), so they survive reloads, resets and browser restarts: they are saved whenever Macaulay2 waits for input, and uploads and editor saves as soon as they are made. Files are removed with the editor's delete buttons, or all at once by clearing the site's data in the browser.
* Interrupting works whenever Macaulay2 calls into JavaScript, which most computations do frequently; otherwise interrupting a second time restarts Macaulay2.
* External programs cannot be run, and features relying on them (`run`, `fork`, `help` in the 1.26.06 package...) fail; chat only echoes locally.

## HTTPS

By default, Macaulay2Web serves HTTP. For production, either run it behind a reverse proxy that handles HTTPS, or enable the built-in Greenlock mode.

Greenlock mode is optional and controlled by environment/configuration rather than a separate branch:

```bash
M2WEB_HTTPS_MODE=greenlock npm start docker 80 443
```

Relevant environment variables:

* `M2WEB_HTTPS_MODE=greenlock`: enable Greenlock HTTPS mode.
* `M2WEB_HTTPS_PORT=443`: default HTTPS port if not passed on the command line.
* `M2WEB_GREENLOCK_CONFIG_DIR=./greenlock.d`: Greenlock configuration directory.
* `M2WEB_MAINTAINER_EMAIL=you@example.org`: maintainer email passed to Greenlock.

Example files are provided as `.greenlockrc.example` and `greenlock.d/config.example.json`. Live Greenlock state and configuration are intentionally ignored by Git.

Historically, HTTPS support lived on a separate `https` branch. That setup has been folded into `main` as the optional Greenlock mode described above.

## Docker Images

There are two Docker image definitions in the repository. Most users only need the root `Dockerfile`.

The base Macaulay2 image is built from `docker-m2-container/Dockerfile`. This is the image used to produce `pzinn/m2container`, which the quickstart downloads with `docker pull`. You only need to rebuild this base image if you want a custom Macaulay2 installation inside Macaulay2Web. It expects a Macaulay2 RPM in the same directory:

```bash
cd docker-m2-container
DOCKER_BUILDKIT=1 docker build \
  --build-arg MACAULAY2_RPM=Macaulay2.rpm \
  -t pzinn/m2container .
```

The root `Dockerfile` builds the runtime image used by Macaulay2Web users. It starts from `pzinn/m2container:latest`, adds SSH configuration, installs the public key generated as `id_rsa.pub`, and exposes SSH on port `22` inside the container:

```bash
docker build -t m2container .
```

## Security Model

Docker mode is the recommended mode. Each user gets a separate container with resource limits defined in `src/server/defaultOptions.ts`.

Local mode is only for trusted development. It runs Macaulay2 directly on the host, so Macaulay2 commands can access host files and processes with the privileges of the server process.

Authentication is optional. If `public/users.htpasswd` exists, HTTP basic authentication is enabled and the authenticated username becomes the Macaulay2Web user id. Otherwise users are identified by generated ids stored in cookies, or by explicit `?user=...` URL parameters.

## Runtime Data

Important runtime paths:

* `public/files/`: saved user file archives.
* `public/tutorials/`: tutorials served by the client and mounted read-only into Docker containers.
* `public/users.htpasswd`: optional authentication file.
* `id_rsa` and `id_rsa.pub`: SSH key pair used by the server to connect to user containers.

Uploaded tutorials are unpacked into `public/tutorials/`. User files inside containers are archived to `public/files/` when containers are stopped or saved.

## Interface

The normal interface is served by `public/index.html` and contains:

* `HOME`: overview and tutorial list.
* `TUTORIAL`: interactive tutorials with runnable Macaulay2 examples.
* `EDITOR`: a browser-based editor and file browser for user files.
* `CHAT`: system messages and lightweight user chat.
* `BROWSE`: documentation or other pages displayed in an iframe.
* A right-hand Macaulay2 terminal.

The interface supports day/night color schemes, dynamic Macaulay2 autocomplete, editor syntax highlighting, terminal cell zooming, tutorial upload, file upload/download, and a mobile layout.

## Tutorials

Tutorials live in `public/tutorials/`. Users can upload tutorials through the `LOAD TUTORIAL` button on the home page.

A tutorial archive must unpack safely inside `public/tutorials/`; archive entries with unsafe paths, symlinks, or hardlinks are rejected by the server.

## URL Options

Useful URL forms:

* `#home`, `#tutorial`, `#editor`, `#chat`, `#browse`: open a specific tab in the normal interface.
* `#tutorial-name-n`: open page `n` of tutorial `name`.
* `?user=name`: choose an explicit user id, allowing the same session to be used across browsers or devices.
* `/minimal.html`: use the minimal embeddable interface.
* `/tutorial.html#tutorial-name-n`: open page `n` of tutorial `name` in the standalone, full-window tutorial interface.
* `?unfold`: reveal every `<hr>`-delimited section on a tutorial page, for example `/tutorial.html?unfold#tutorial-name-n`.
* `?engine=wasm` / `?engine=server`: run Macaulay2 in the browser or on the server (see WebAssembly Engine).

Example minimal embed:

```html
<iframe
  style="background:#A8A8B8;overflow:hidden;resize:both"
  scrolling="no"
  src="https://www.unimelb-macaulay2.cloud.edu.au/minimal.html"
  title="Macaulay2"
></iframe>
```

The minimal interface does not read or write cookies. If no `user` option is specified, it uses a default shared public session.

## Build Commands

```bash
npm run build
```

Builds the server, full client, minimal client, standalone tutorial client, and CSS.

Individual build commands:

* `npm run build:server`: compile server TypeScript to `dist/server/`.
* `npm run build:client`: build the normal client bundle `public/index.js`.
* `npm run build:minimal`: build the minimal client bundle `public/minimal.js`.
* `npm run build:tutorial`: build the standalone tutorial bundle `public/tutorial.js`.
* `npm run build:css`: build `public/index.css`, `public/minimal.css`, and `public/tutorial.css`.
* `npm run build:wasm`: build the client bundles with the WebAssembly engine as default, and fetch the engine.
* `npm run build:debug`: build a non-production normal client bundle.
* `npm run build:debug-minimal`: build a non-production minimal client bundle.
* `npm run build:debug-tutorial`: build a non-production standalone tutorial bundle.

Generated build outputs in `dist/` and `public/*.js` / `public/*.css` are not tracked by Git.

## Tests And Formatting

Client tests:

```bash
npm run test:client
```

Server tests:

```bash
npm run test:server
```

Watch client tests during development:

```bash
npm run test:client:watch
```

Lint and formatting commands:

```bash
npm run lint
npm run format
```

## Source Layout

Main source directories:

* `src/server/`: server, Docker/container management, upload/download handling, chat, tests.
* `src/client/`: browser client TypeScript.
* `src/client/css/`: CSS sources assembled into the full, minimal, and standalone tutorial stylesheets.
* `src/common/`: code shared between client and server.
* `public/`: static files served to the browser.
* `docker-m2-container/`: Dockerfile for the base Macaulay2 image.
* `unix-files/`: SSH configuration copied into the runtime Docker image.
* `KaTeX/`: KaTeX source submodule used for rendering mathematics and building CSS/fonts.

## Historical Notes

Macaulay2Web was originally derived from InteractiveShell, a browser terminal emulator for remote Macaulay2 sessions. The current codebase has diverged substantially; InteractiveShell should be treated as historical background rather than current implementation documentation.

Old Vagrant configurations remain under `setups/`. They are not the recommended installation path and may be obsolete. The maintained development and deployment path is the Docker-based workflow described above.
