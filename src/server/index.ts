let mode = "docker";
const args: string[] = process.argv;
const n: number = args.length;
import fs = require("fs");
import { AuthOption } from "./enums";

import { options, overrideDefaultOptions } from "./startupConfigs/default";

if (n > 2) {
  console.log("mode " + args[2] + " requested");
  mode = args[2];
}

if (n > 4) {
  console.log("Too many options");
  usage();
  process.exit(0);
}

function usage(): void {
  console.log("Usage: node dist/server/index.js {local|docker|ssh} [port]");
}

// Dirname is dist.
import p = require("path"); // eslint-disable-line  no-undef
const path = p.join(__dirname, "/startupConfigs/"); // eslint-disable-line  no-undef

if (mode === "--help") {
  usage();
  process.exit(0);
}

let overrideOptions;
if (mode === "local") {
  overrideOptions = require(path + "Macaulay2LocalServer");
} else if (mode === "docker") {
  overrideOptions = require(path + "Macaulay2SudoDocker");
} else if (mode === "ssh") {
  overrideOptions = require(path + "Macaulay2SshDocker");
} else {
  console.log("There is no mode " + mode);
}

overrideDefaultOptions(overrideOptions.options, options);

if (n > 3) {
  console.log("port " + args[3] + " requested");
  overrideDefaultOptions({ serverConfig: { port: args[3] } }, options);
}

// This starts the main server!

const fileExistsPromise = function (filename) {
  return new Promise(function (resolve) {
    fs.access(filename, fs.constants.R_OK, function (err) {
      resolve(!err);
    });
  });
};

fileExistsPromise("public/users.htpasswd")
  .then(function (exists) {
    if (exists) {
      overrideOptions.authentication = AuthOption.basic;
    } else {
      overrideOptions.authentication = AuthOption.none;
    }
  })
  .then(function () {
    const MathServer = require("./server").mathServer(options);
    MathServer.listen();
  })
  .catch(function (err) {
    console.log(err);
  });
