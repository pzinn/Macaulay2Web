let mode = "docker";
const args: string[] = process.argv;
const n: number = args.length;
import fs = require("fs");

import { options, overrideDefaultOptions } from "../startupConfigs/default";
import { mathServer } from "./server";

import { logger } from "./logger";

const usage = function (): void {
  logger.info("Usage: npm {run/start} {local|docker|ssh} [port]");
};

logger.info("Macaulay2Web version " + options.version);

if (n > 2) {
  logger.info("mode " + args[2] + " requested");
  mode = args[2];
}

if (n > 4) {
  logger.error("Too many options");
  usage();
  process.exit(0);
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
