import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "../client";
import type { Socket } from "socket.io";

const mocks = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  safeEmit: vi.fn(),
  emitViaClientSockets: vi.fn(),
  clients: {} as Record<string, any>,
  io: {},
}));
vi.mock("../logger", () => ({
  logger: { warn: mocks.warn, info: mocks.info },
}));
vi.mock("../exec", () => ({ execInInstance: vi.fn() }));
vi.mock("../server", () => ({
  ...mocks,
  short: (msg: string) => msg.substring(0, 50),
  options: {
    adminName: "admin",
    adminAlias: "Admin",
    systemAlias: "System",
    defaultAlias: "Anonymous",
    premiumList: [],
  },
  instanceManager: {},
  expectMathProgramClose: vi.fn(),
}));

const socket = {
  id: "test-socket",
  handshake: {
    address: "127.0.0.1",
    headers: { "user-agent": "test-agent" },
  },
  conn: { transport: { name: "websocket" } },
} as unknown as Socket;
const client = { id: "sender" } as Client;
const message = () => ({
  type: "message",
  alias: "Alice",
  time: 123,
  text: "private text",
  message: "<b>private text</b>",
  recipients: { "": null },
});
const restore = { type: "restore", alias: "Alice", time: 123, index: -1 };
let handle: (payload: unknown) => void;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  for (const key of Object.keys(mocks.clients)) delete mocks.clients[key];
  mocks.clients.sender = client;
  handle = (await import("../chat")).socketChatAction(socket, client);
});

describe("incoming chat validation", () => {
  const invalid: [string, unknown][] = [
    ["missing payload", undefined],
    ["null payload", null],
    ["array payload", []],
    ["string payload", "hello"],
    ["empty payload", {}],
    ["unknown type", { ...message(), type: "bogus" }],
    ...["text", "message", "alias"].flatMap((field) =>
      [undefined, null, 42, {}, []].map(
        (value) =>
          [
            `${field}: ${JSON.stringify(value)}`,
            { ...message(), [field]: value },
          ] as [string, unknown]
      )
    ),
    ...[undefined, null, [], "all"].map(
      (value) =>
        [
          `recipients: ${JSON.stringify(value)}`,
          { ...message(), recipients: value },
        ] as [string, unknown]
    ),
    ...[42, "Alice", {}, [null], [42], [[]]].map(
      (value) =>
        [
          `recipient value: ${JSON.stringify(value)}`,
          { ...message(), recipients: { other: value } },
        ] as [string, unknown]
    ),
    ...[undefined, "123", NaN, Infinity, 8.64e15 + 1].map(
      (value) =>
        [`time: ${value}`, { ...message(), time: value }] as [string, unknown]
    ),
    ...[undefined, "0", -2, 0.5, Infinity].map(
      (value) =>
        [`restore index: ${value}`, { ...restore, index: value }] as [
          string,
          unknown
        ]
    ),
    ["negative delete index", { ...restore, type: "delete" }],
  ];

  it.each(invalid)(
    "rejects %s without emitting or polluting history",
    (_name, payload) => {
      expect(() => handle(payload)).not.toThrow();
      expect(mocks.warn).toHaveBeenCalledOnce();
      expect(mocks.safeEmit).not.toHaveBeenCalled();
      expect(mocks.emitViaClientSockets).not.toHaveBeenCalled();
      expect(() => handle(restore)).not.toThrow();
      expect(mocks.safeEmit).toHaveBeenCalledWith(socket, "chat", []);
      handle(message());
      expect(mocks.safeEmit).toHaveBeenLastCalledWith(
        mocks.io,
        "chat",
        expect.objectContaining({ index: 1 })
      );
    }
  );

  it("logs useful connection and payload diagnostics without message contents", () => {
    const payload = { ...message(), text: undefined };
    handle(payload);
    const [warning, loggedClient] = mocks.warn.mock.calls[0];
    expect(loggedClient).toBe(client);
    const details = JSON.parse(
      warning.replace("Rejected malformed chat: ", "")
    );
    expect(details).toMatchObject({
      reason: "text must be a string",
      socketId: "test-socket",
      address: "127.0.0.1",
      transport: "websocket",
      userAgent: "test-agent",
      payload: {
        type: "message",
        text: "undefined",
        message: "string(length=19)",
      },
    });
    expect(warning).not.toContain("private text");
    expect(warning).not.toContain("Alice");
  });

  it("bounds and escapes client-controlled diagnostic strings", () => {
    handle({ type: "\n".repeat(10000), ["x".repeat(10000)]: "secret" });
    const warning = mocks.warn.mock.calls[0][0];
    expect(warning.length).toBeLessThan(1500);
    expect(warning).not.toContain("\n");
    expect(warning).not.toContain("secret");
  });

  it("validates admin messages too", async () => {
    const adminHandle = (await import("../chat")).socketChatAction(socket, {
      id: "admin",
    } as Client);
    expect(() => adminHandle({ ...message(), text: undefined })).not.toThrow();
    expect(mocks.warn).toHaveBeenCalledOnce();
  });
});

describe("valid chat behavior", () => {
  it.each(["hello", "", "[image]"])(
    "broadcasts messages with text %j",
    (text) => {
      handle({ ...message(), text });
      expect(mocks.warn).not.toHaveBeenCalled();
      expect(mocks.safeEmit).toHaveBeenCalledWith(
        mocks.io,
        "chat",
        expect.objectContaining({ text, index: 0, recipients: null })
      );
    }
  );

  it("delivers private messages and a sender copy, then restores and deletes", () => {
    const other = { id: "other" };
    mocks.clients.other = other;
    handle({ ...message(), recipients: { other: ["Bob"] } });
    expect(mocks.emitViaClientSockets).toHaveBeenCalledWith(
      other,
      "chat",
      expect.objectContaining({ recipients: ["Bob"] })
    );
    expect(mocks.emitViaClientSockets).toHaveBeenCalledWith(
      client,
      "chat",
      expect.objectContaining({ recipients: ["Alice"] })
    );
    handle(restore);
    expect(mocks.safeEmit).toHaveBeenLastCalledWith(socket, "chat", [
      expect.objectContaining({ index: 0, recipients: ["Alice"] }),
    ]);
    handle({ type: "delete", alias: "Alice", time: 123, index: 0 });
    handle(restore);
    expect(mocks.safeEmit).toHaveBeenLastCalledWith(socket, "chat", []);
  });

  it("defaults empty recipients to the sender", () => {
    handle({ ...message(), recipients: {} });
    expect(mocks.emitViaClientSockets).toHaveBeenCalledWith(
      client,
      "chat",
      expect.objectContaining({ recipients: null })
    );
  });

  it("handles slash commands without recording them", () => {
    handle({ ...message(), text: "/help" });
    expect(mocks.safeEmit).toHaveBeenCalledWith(
      socket,
      "chat",
      expect.objectContaining({ alias: "/help", recipients: null })
    );
    handle(restore);
    expect(mocks.safeEmit).toHaveBeenLastCalledWith(socket, "chat", []);
  });

  it("does not trust server-owned fields or dictionary prototypes", () => {
    handle({
      ...message(),
      id: "forged",
      index: 999,
      recipientsSummary: "forged",
    });
    expect(mocks.safeEmit.mock.calls[0][2]).not.toHaveProperty("id");
    expect(mocks.safeEmit.mock.calls[0][2]).not.toHaveProperty(
      "recipientsSummary"
    );
    expect(mocks.safeEmit.mock.calls[0][2].index).toBe(0);
    const recipients = JSON.parse(
      '{"__proto__":null,"constructor":null,"toString":null}'
    );
    expect(() => handle({ ...message(), recipients })).not.toThrow();
    expect(mocks.emitViaClientSockets).toHaveBeenCalledTimes(1);
    expect(Object.getPrototypeOf(recipients)).toBe(Object.prototype);
  });
});
