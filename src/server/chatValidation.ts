import { Chat } from "../common/chatClass";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

type ChatParseResult =
  | { chat: Chat; error?: never }
  | { chat?: never; error: string };

export const parseIncomingChat = (payload: unknown): ChatParseResult => {
  if (!isRecord(payload)) return { error: "payload must be an object" };
  const { type, alias, time, text, message, index, recipients } = payload;
  if (type !== "message" && type !== "restore" && type !== "delete")
    return { error: "type must be message, restore, or delete" };
  if (typeof alias !== "string") return { error: "alias must be a string" };
  if (
    typeof time !== "number" ||
    !Number.isFinite(time) ||
    Math.abs(time) > 8.64e15
  )
    return { error: "time must be a valid numeric timestamp" };

  // Copy only client-owned fields; never trust supplied IDs or display summaries.
  const chat: Chat = { type, alias, time };
  if (type !== "message") {
    if (
      typeof index !== "number" ||
      !Number.isSafeInteger(index) ||
      index < (type === "restore" ? -1 : 0)
    )
      return { error: "index must be a valid chat index" };
    chat.index = index;
    return { chat };
  }
  if (typeof text !== "string") return { error: "text must be a string" };
  if (typeof message !== "string") return { error: "message must be a string" };
  if (!isRecord(recipients)) return { error: "recipients must be an object" };
  const normalizedRecipients = Object.create(null);
  for (const [id, aliases] of Object.entries(recipients)) {
    if (
      aliases !== null &&
      (!Array.isArray(aliases) ||
        !aliases.every((alias) => typeof alias === "string"))
    )
      return { error: "each recipient must be null or an array of strings" };
    // IDs such as "__proto__" must remain ordinary dictionary keys.
    normalizedRecipients[id] =
      aliases === null ? null : (aliases as string[]).slice();
  }
  chat.text = text;
  chat.message = message;
  chat.recipients = normalizedRecipients;
  return { chat };
};

const describeValue = (value: unknown): string => {
  if (value === null) return "null";
  if (typeof value === "string") return `string(length=${value.length})`;
  if (Array.isArray(value)) return `array(length=${value.length})`;
  return typeof value;
};

// Bounded, shallow diagnostics: no message bodies, image data, or recipient aliases.
export const describeChatPayload = (payload: unknown) => {
  if (!isRecord(payload)) return { shape: describeValue(payload) };
  const keys = Object.keys(payload);
  return {
    shape: "object",
    keyCount: keys.length,
    keys: keys.slice(0, 12).map((key) => key.slice(0, 64)),
    type:
      typeof payload.type === "string"
        ? payload.type.slice(0, 32)
        : describeValue(payload.type),
    alias: describeValue(payload.alias),
    time: describeValue(payload.time),
    text: describeValue(payload.text),
    message: describeValue(payload.message),
    index: describeValue(payload.index),
    recipients: describeValue(payload.recipients),
  };
};
