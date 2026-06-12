// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { waitForDockerSshd } from "../dockerStartup";
import { Instance } from "../instance";

const instance: Instance = {
  host: "127.0.0.1",
  port: 22,
  username: "m2user",
  containerName: "m2Port1234",
  lastActiveTime: 0,
  numInputs: 0,
  clientId: "test",
  sshKey: "",
};

describe("Docker sshd startup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("rechecks the same container until sshd is ready", async () => {
    const execFile = vi
      .fn()
      .mockImplementationOnce((command, args, next) =>
        next(null, "root 1 other-process", "")
      )
      .mockImplementationOnce((command, args, next) =>
        next(null, "root 1 /usr/sbin/sshd -D", "")
      );
    const next = vi.fn();

    waitForDockerSshd(
      instance,
      "/usr/sbin/sshd -D",
      next,
      { retryMs: 1000, timeoutMs: 5000 },
      execFile
    );
    await vi.advanceTimersByTimeAsync(1000);

    expect(execFile).toHaveBeenCalledTimes(2);
    expect(execFile).toHaveBeenNthCalledWith(
      1,
      "sudo",
      ["docker", "exec", "m2Port1234", "ps", "aux"],
      expect.any(Function)
    );
    expect(next).toHaveBeenCalledWith();
  });

  it("reports a bounded timeout instead of creating another container", async () => {
    const execFile = vi.fn((command, args, next) =>
      next(new Error("container is starting"), "", "")
    );
    const next = vi.fn();

    waitForDockerSshd(
      instance,
      "/usr/sbin/sshd -D",
      next,
      { retryMs: 250, timeoutMs: 1000 },
      execFile
    );
    await vi.advanceTimersByTimeAsync(1000);

    expect(execFile).toHaveBeenCalledTimes(5);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("Timed out waiting for sshd"),
      })
    );
  });
});
