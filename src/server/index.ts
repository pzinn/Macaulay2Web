let mode = "docker";
const args: string[] = process.argv;
const n: number = args.length;
import fs = require("fs");
import { AuthOption } from "./enums";

import { options, overrideDefaultOptions } from "./startupConfigs/default";

const logger = require("./logger");

if (n > 2) {
  logger.info("mode " + args[2] + " requested");
  mode = args[2];
}

if (n > 5) {
  logger.error("Too many options");
  usage();
  process.exit(0);
}

function usage(): void {
  logger.info(
    "Usage: node dist/server/index.js {local|docker|ssh} [http port] [https port]"
  );
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
  logger.error("There is no mode " + mode);
}

overrideDefaultOptions(overrideOptions.options, options);

if (n > 3) {
  logger.info("http  port " + args[3] + " requested");
  overrideDefaultOptions({ serverConfig: { port: args[3] } }, options);
}

if (n > 4) {
  logger.info("https port " + args[4] + " requested");
  overrideDefaultOptions({ serverConfig: { port2: args[4] } }, options);
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
    require("./server").mathServer(options);
  })
  .catch(function (err) {
    logger.error(err);
  });
