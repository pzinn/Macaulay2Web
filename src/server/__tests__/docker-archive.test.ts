// @vitest-environment node

import { EventEmitter } from "events";
import fs = require("fs");
import os = require("os");
import path = require("path");
import { PassThrough } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  archiveDockerHome,
  isDockerContainerMissingError,
} from "../dockerArchive";
import { Instance } from "../instance";

const instance: Instance = {
  host: "127.0.0.1",
  port: 22,
  username: "m2user",
  containerName: "m2Client.test",
  lastActiveTime: 0,
  numInputs: 0,
  clientId: "test",
  sshKey: "",
};

const fakeSpawn = function (output: string, code: number, stderr = "") {
  return vi.fn(() => {
    const child = new EventEmitter() as any;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.killed = false;
    child.kill = vi.fn(() => {
      child.killed = true;
    });
    setImmediate(() => {
      child.stdout.end(output);
      child.stderr.end(stderr);
      child.emit("close", code, null);
    });
    return child;
  });
};

const archive = function (savePath: string, spawn): Promise<void> {
  return new Promise((resolve, reject) => {
    archiveDockerHome(
      instance,
      savePath,
      function (error) {
        if (error) reject(error);
        else resolve();
      },
      spawn
    );
  });
};

describe("Docker home archiving", () => {
  let directory: string;
  let savePath: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "m2web-archive-"));
    savePath = path.join(directory, "save.tar.gz");
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("atomically replaces the previous archive after success", async () => {
    fs.writeFileSync(savePath, "previous archive");
    const spawn = fakeSpawn("new archive", 0);

    await archive(savePath, spawn);

    expect(fs.readFileSync(savePath, "utf8")).toBe("new archive");
    expect(fs.existsSync(savePath + ".tmp")).toBe(false);
    expect(spawn).toHaveBeenCalledWith(
      "sudo",
      [
        "docker",
        "exec",
        "m2Client.test",
        "tar",
        "--exclude=./.*",
        "--exclude=./tutorials",
        "-C",
        "/home/m2user",
        "-czf",
        "-",
        ".",
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
  });

  it("preserves the previous archive when Docker archiving fails", async () => {
    fs.writeFileSync(savePath, "previous archive");
    const spawn = fakeSpawn("partial archive", 1, "container unavailable");

    await expect(archive(savePath, spawn)).rejects.toThrow(
      "docker exec failed with exit code 1: container unavailable"
    );

    expect(fs.readFileSync(savePath, "utf8")).toBe("previous archive");
    expect(fs.existsSync(savePath + ".tmp")).toBe(false);
  });
});

describe("Docker missing-container errors", () => {
  it("recognizes Docker container and object errors", () => {
    expect(
      isDockerContainerMissingError(
        new Error("Error response from daemon: No such container: m2Port1051")
      )
    ).toBe(true);
    expect(
      isDockerContainerMissingError(
        new Error("Error response from daemon: No such object: m2Port1051")
      )
    ).toBe(true);
  });

  it("does not classify other Docker failures as missing containers", () => {
    expect(isDockerContainerMissingError(new Error("permission denied"))).toBe(
      false
    );
  });
});
