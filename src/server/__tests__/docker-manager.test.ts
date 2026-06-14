// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  archiveDockerHome: vi.fn(),
  clients: {} as Record<string, any>,
  exec: vi.fn(),
  notifyExpectedMathProgramStop: vi.fn(),
  waitForDockerSshd: vi.fn(),
}));

vi.mock("../server", () => ({
  clients: mocks.clients,
  staticFolder: "/tmp/m2web-manager-tests/",
  options: { premiumList: [] },
  notifyExpectedMathProgramStop: mocks.notifyExpectedMathProgramStop,
}));

vi.mock("../dockerArchive", () => ({
  archiveDockerHome: mocks.archiveDockerHome,
}));

vi.mock("../dockerStartup", () => ({
  waitForDockerSshd: mocks.waitForDockerSshd,
}));

vi.mock("../logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { Instance } from "../instance";
import { NewDockerContainersInstanceManager } from "../newDocker";
import { SudoDockerContainersInstanceManager } from "../sudoDocker";

const resources = {
  cpuShares: 1,
  memory: 384,
};

const hostConfig = {
  containerType: "m2container",
  maxContainerNumber: 10,
  minContainerAge: 0,
  sshdCmd: "/usr/sbin/sshd -D",
};

const startingInstance = (): Instance => ({
  host: "127.0.0.1",
  port: 41000,
  username: "m2user",
  sshKey: "/tmp/test-key",
  lastActiveTime: 0,
  numInputs: 0,
  clientId: "",
});

const dependencies = () =>
  ({
    access: mocks.access,
    archiveDockerHome: mocks.archiveDockerHome,
    exec: mocks.exec,
    waitForDockerSshd: mocks.waitForDockerSshd,
  } as any);

const managers = [
  {
    label: "published-port Docker manager",
    create: () =>
      new SudoDockerContainersInstanceManager(
        resources,
        hostConfig,
        startingInstance(),
        dependencies()
      ),
    configureSuccessfulExec: () => {
      mocks.exec.mockImplementation((command, next) => next(null, "", ""));
    },
  },
  {
    label: "bridge-network Docker manager",
    create: () =>
      new NewDockerContainersInstanceManager(
        resources,
        hostConfig,
        startingInstance(),
        dependencies()
      ),
    configureSuccessfulExec: () => {
      mocks.exec.mockImplementation((command, next) => {
        if (command.startsWith("sudo docker inspect "))
          next(
            null,
            JSON.stringify([
              {
                NetworkSettings: {
                  Networks: { bridge: { IPAddress: "172.17.0.12" } },
                },
              },
            ]),
            ""
          );
        else next(null, "", "");
      });
    },
  },
];

describe.each(managers)("$label", ({ create, configureSuccessfulExec }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const clientId of Object.keys(mocks.clients))
      delete mocks.clients[clientId];
    mocks.access.mockImplementation((fileName, next) =>
      next(new Error("no saved archive"))
    );
    configureSuccessfulExec();
    mocks.archiveDockerHome.mockImplementation((instance, savePath, next) =>
      next()
    );
    mocks.waitForDockerSshd.mockImplementation((instance, command, next) =>
      next()
    );
  });

  it("coalesces simultaneous creation requests into one container", () => {
    let ready;
    mocks.waitForDockerSshd.mockImplementation((instance, command, next) => {
      ready = next;
    });
    const manager = create();
    const first = vi.fn();
    const second = vi.fn();

    manager.getNewInstance("same-client", first);
    manager.getNewInstance("same-client", second);

    const runCommands = mocks.exec.mock.calls.filter(([command]) =>
      command.startsWith("sudo docker run ")
    );
    expect(runCommands).toHaveLength(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    ready();

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(first.mock.calls[0][0]).toBe(second.mock.calls[0][0]);
  });

  it("archives even an unused container before removing it", () => {
    let finishArchive;
    mocks.archiveDockerHome.mockImplementation((instance, savePath, next) => {
      finishArchive = next;
    });
    const manager = create() as any;
    const instance: Instance = {
      ...startingInstance(),
      clientId: "save-me",
      containerName: "m2Client.save-me",
      numInputs: 0,
    };
    mocks.clients[instance.clientId] = { instance };
    manager.currentContainers.push(instance);
    const removed = vi.fn();

    manager.removeInstanceFromId(instance.clientId, removed);

    expect(mocks.archiveDockerHome).toHaveBeenCalledWith(
      instance,
      "/tmp/m2web-manager-tests/files/save-me-save.tar.gz",
      expect.any(Function)
    );
    expect(
      mocks.exec.mock.calls.some(([command]) =>
        command.startsWith("sudo docker rm -f ")
      )
    ).toBe(false);
    expect(removed).not.toHaveBeenCalled();

    finishArchive();

    expect(mocks.exec).toHaveBeenCalledWith(
      "sudo docker rm -f m2Client.save-me",
      expect.any(Function)
    );
    expect(removed).toHaveBeenCalledWith(undefined);
    expect(mocks.clients[instance.clientId].instance).toBeNull();
  });

  it("keeps the container when its files cannot be archived", () => {
    const archiveError = new Error("disk full");
    mocks.archiveDockerHome.mockImplementation((instance, savePath, next) =>
      next(archiveError)
    );
    const manager = create() as any;
    const instance: Instance = {
      ...startingInstance(),
      clientId: "archive-failure",
      containerName: "m2Client.archive-failure",
    };
    mocks.clients[instance.clientId] = { instance };
    manager.currentContainers.push(instance);
    const removed = vi.fn();

    manager.removeInstanceFromId(instance.clientId, removed);

    expect(
      mocks.exec.mock.calls.some(([command]) =>
        command.startsWith("sudo docker rm -f ")
      )
    ).toBe(false);
    expect(removed).toHaveBeenCalledWith(archiveError);
    expect(mocks.clients[instance.clientId].instance).toBe(instance);
    expect(manager.currentContainers).toContain(instance);
    expect(instance.removalInProgress).toBe(false);
  });

  it("joins callbacks when removal is already in progress", () => {
    let finishArchive;
    mocks.archiveDockerHome.mockImplementation((instance, savePath, next) => {
      finishArchive = next;
    });
    const manager = create() as any;
    const instance: Instance = {
      ...startingInstance(),
      clientId: "double-remove",
      containerName: "m2Client.double-remove",
    };
    mocks.clients[instance.clientId] = { instance };
    manager.currentContainers.push(instance);
    const first = vi.fn();
    const second = vi.fn();

    manager.removeInstanceFromId(instance.clientId, first);
    manager.removeInstanceFromId(instance.clientId, second);
    finishArchive();

    expect(mocks.archiveDockerHome).toHaveBeenCalledTimes(1);
    expect(
      mocks.exec.mock.calls.filter(([command]) =>
        command.startsWith("sudo docker rm -f ")
      )
    ).toHaveLength(1);
    expect(first).toHaveBeenCalledWith(undefined);
    expect(second).toHaveBeenCalledWith(undefined);
  });
});
