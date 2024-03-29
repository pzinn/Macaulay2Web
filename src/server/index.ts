let mode = "docker";
const args: string[] = process.argv;
const n: number = args.length;
import fs = require("fs");

import { options, overrideDefaultOptions } from "./defaultOptions";
import { mathServer } from "./server";

import { logger } from "./logger";

const usage = function (): void {
  logger.info("Usage: npm {run/start} {local|docker|ssh} [port]");
};

logger.info("Macaulay2Web version " + options.version);

if (n > 4) {
  logger.error("Too many options");
  usage();
  process.exit(0);
}

if (n > 2) mode = args[2];

if (mode === "--help") {
  usage();
  process.exit(0);
} else logger.info("mode " + mode + " requested");

// Dirname is dist.
import p = require("path"); // eslint-disable-line  no-undef
const path = p.join(__dirname, "/"); // eslint-disable-line  no-undef

let overrideOptions;
if (mode === "local") {
  overrideOptions = require(path + "localServer");
} else if (mode === "docker") {
  overrideOptions = require(path + "sudoDocker");
} else if (mode === "ssh") {
  overrideOptions = require(path + "sshDocker");
} else {
  logger.error("There is no mode " + mode);
  usage();
  process.exit(0);
}

overrideDefaultOptions(overrideOptions.options, options);
options.serverConfig.mode = mode;

if (n > 3) {
  logger.info("port " + args[3] + " requested");
  overrideDefaultOptions({ serverConfig: { port: args[3] } }, options);
}

const fileExistsPromise = function (filename) {
  return new Promise(function (resolve) {
    fs.access(filename, fs.constants.R_OK, function (err) {
      resolve(!err);
    });
  });
};

// This starts the main server!

fileExistsPromise("public/users.htpasswd")
  .then(function (exists) {
    if (exists) {
      options.authentication = true;
    } else {
      options.authentication = false;
    }
  })
  .then(function () {
    mathServer(options);
  })
  .catch(function (err) {
    logger.error(err);
  });
