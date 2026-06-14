import { completionProtocol } from "../common/tags";

interface CompletionEntry {
  name: string;
  kind: string;
}

interface CompletionResponse {
  id: string;
  completions: CompletionEntry[] | null;
}

interface CompletionOutputHandlers {
  output: (data: string) => void;
  response: (response: CompletionResponse) => void;
  warn?: (message: string) => void;
}

const maxCompletionFrameLength = 200000;

const normalizeCompletionEntry = function (entry): CompletionEntry | null {
  if (typeof entry === "string") return { name: entry, kind: "" };
  if (!entry || typeof entry !== "object" || typeof entry.name !== "string")
    return null;
  if (entry.name.length == 0 || entry.name.length > 256) return null;
  return {
    name: entry.name,
    kind: typeof entry.kind === "string" ? entry.kind : "",
  };
};

const parseCompletionResponse = function (
  payload: string,
  warn: (message: string) => void = () => {}
): CompletionResponse | null {
  const tab = payload.indexOf("\t");
  const id = tab < 0 ? payload : payload.substring(0, tab);
  if (!id || !/^[A-Za-z0-9_-]{1,96}$/.test(id)) {
    warn("Dropping malformed completion response");
    return null;
  }

  let completions = null;
  try {
    const rawCompletions = JSON.parse(
      tab < 0 ? "[]" : payload.substring(tab + 1)
    );
    if (Array.isArray(rawCompletions))
      completions = rawCompletions
        .map(normalizeCompletionEntry)
        .filter((entry) => entry !== null);
  } catch (error) {
    warn("Dropping malformed completion payload: " + error);
  }
  return { id, completions };
};

const completionResponsePrefixLength = function (data: string) {
  const maxLength = Math.min(
    data.length,
    completionProtocol.ResponseStart.length - 1
  );
  for (let length = maxLength; length > 0; length--)
    if (completionProtocol.ResponseStart.startsWith(data.slice(-length)))
      return length;
  return 0;
};

const consumeCompletionOutput = function (
  bufferedData: string,
  incomingData: string,
  handlers: CompletionOutputHandlers,
  maximumFrameLength = maxCompletionFrameLength
): string {
  let data = bufferedData + incomingData;
  const warn = handlers.warn || (() => {});

  while (data.length > 0) {
    const start = data.indexOf(completionProtocol.ResponseStart);
    if (start < 0) {
      const keep = completionResponsePrefixLength(data);
      if (keep > 0) {
        if (data.length > keep) handlers.output(data.slice(0, -keep));
        return data.slice(-keep);
      }
      handlers.output(data);
      return "";
    }
    if (start > 0) {
      handlers.output(data.substring(0, start));
      data = data.substring(start);
    }

    const end = data.indexOf(
      completionProtocol.End,
      completionProtocol.ResponseStart.length
    );
    if (end < 0) {
      if (data.length > maximumFrameLength) {
        warn("Dropping oversized incomplete completion frame");
        data = data.substring(completionProtocol.ResponseStart.length);
        continue;
      }
      return data;
    }

    const response = parseCompletionResponse(
      data.substring(completionProtocol.ResponseStart.length, end),
      warn
    );
    if (response) handlers.response(response);
    data = data.substring(end + completionProtocol.End.length);
  }
  return "";
};

export {
  CompletionEntry,
  CompletionResponse,
  consumeCompletionOutput,
  normalizeCompletionEntry,
  parseCompletionResponse,
};
