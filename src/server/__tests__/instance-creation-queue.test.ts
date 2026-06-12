// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { Instance } from "../instance";
import { InstanceCreationQueue } from "../instanceCreationQueue";

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

describe("instance creation queue", () => {
  it("coalesces simultaneous requests for one client", () => {
    const queue = new InstanceCreationQueue();
    const first = vi.fn();
    const second = vi.fn();

    expect(queue.request("test", first)).toBe(true);
    expect(queue.request("test", second)).toBe(false);
    expect(queue.has("test")).toBe(true);

    queue.complete(instance);

    expect(first).toHaveBeenCalledWith(instance);
    expect(second).toHaveBeenCalledWith(instance);
    expect(queue.has("test")).toBe(false);
  });
});
