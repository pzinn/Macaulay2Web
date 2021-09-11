let mode = "docker";
const args: string[] = process.argv;
const n: number = args.length;
import fs = require("fs");

import { options, overrideDefaultOptions } from "./defaultOptions";
import { mathServer } from "./server";

import { logger } from "./logger";

const usage = function (): void {
  logger.info(
    "Usage: npm {run/start} {local|docker|docker-recreate|ssh} [http port] [https port]"
  );
};

logger.info("Macaulay2Web version " + options.version);

if (n > 5) {
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
} else if (mode === "docker" || mode === "docker-recreate") {
  overrideOptions = require(path + "sudoDocker");
} else if (mode === "ssh") {
  overrideOptions = require(path + "sshDocker");
} else {
  logger.error("There is no mode " + mode);
  usage();
  process.exit(0);
}

overrideDefaultOptions(overrideOptions.options, options);

if (mode === "docker-recreate") options.recreate = true;

if (n > 3) {
  logger.info("http  port " + args[3] + " requested");
  overrideDefaultOptions({ serverConfig: { port: args[3] } }, options);
}

if (n > 4) {
  logger.info("https port " + args[4] + " requested");
  overrideDefaultOptions({ serverConfig: { port2: args[4] } }, options);
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
