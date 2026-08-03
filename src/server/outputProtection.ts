import { webAppTags } from "../common/tags";

interface OutputLimitOptions {
  maxOutputBytesPerSecond: number;
  maxOutputBurstBytes: number;
  maxOutputBytesPerInput: number;
  outputChunkOverheadBytes: number;
}

type OutputLimitReason = "rate" | "input";

interface OutputProtectionState {
  availableBytes: number;
  lastRefillTime: number | null;
  bytesThisInput: number;
  blocked: boolean;
}

interface BoundedOutputHistory {
  output: string;
  dropping: boolean;
}

const vdots = " \u22EE\n";
const maxCellNestingDepth = 32;
const cellRegExp = new RegExp(
  webAppTags.Cell +
    "[^" +
    webAppTags.Cell +
    webAppTags.CellEnd +
    "]*" +
    webAppTags.CellEnd,
  "g"
);

const createOutputProtectionState = function (): OutputProtectionState {
  return {
    availableBytes: 0,
    lastRefillTime: null,
    bytesThisInput: 0,
    blocked: false,
  };
};

const resetOutputForProcess = function (
  state: OutputProtectionState,
  limits: OutputLimitOptions,
  now: number
): void {
  state.availableBytes = limits.maxOutputBurstBytes;
  state.lastRefillTime = now;
  state.bytesThisInput = 0;
  state.blocked = false;
};

const resetOutputForInput = function (state: OutputProtectionState): void {
  state.bytesThisInput = 0;
};

const beginOutputShutdown = function (state: OutputProtectionState): boolean {
  if (state.blocked) return false;
  state.blocked = true;
  return true;
};

const chargeOutput = function (
  state: OutputProtectionState,
  byteLength: number,
  limits: OutputLimitOptions,
  now: number
): OutputLimitReason | null {
  if (state.lastRefillTime === null) {
    state.availableBytes = limits.maxOutputBurstBytes;
    state.lastRefillTime = now;
  } else {
    const elapsedSeconds = Math.max(0, now - state.lastRefillTime) / 1000;
    state.availableBytes = Math.min(
      limits.maxOutputBurstBytes,
      state.availableBytes + elapsedSeconds * limits.maxOutputBytesPerSecond
    );
    state.lastRefillTime = now;
  }

  state.bytesThisInput += byteLength;
  if (state.bytesThisInput > limits.maxOutputBytesPerInput) return "input";

  const cost = byteLength + limits.outputChunkOverheadBytes;
  if (cost > state.availableBytes) return "rate";
  state.availableBytes -= cost;
  return null;
};

const utf8Suffix = function (value: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  const buffer = Buffer.from(value);
  if (buffer.length <= maxBytes) return value;
  let start = buffer.length - maxBytes;
  while (start < buffer.length && (buffer[start] & 0xc0) === 0x80) start++;
  return buffer.subarray(start).toString("utf8");
};

const ellipsisWithTail = function (tail: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  const ellipsisBytes = Buffer.byteLength(vdots);
  if (ellipsisBytes >= maxBytes) return utf8Suffix(vdots, maxBytes);
  return vdots + utf8Suffix(tail, maxBytes - ellipsisBytes);
};

// Replace the oldest innermost completed cells first. Repeating the pass makes
// their enclosing cells eligible without repeatedly rescanning for every cell.
const compactCompletedCells = function (
  initialOutput: string,
  maxBytes: number
): string {
  let output = initialOutput;
  let outputBytes = Buffer.byteLength(output);
  const ellipsisBytes = Buffer.byteLength(vdots);

  for (
    let depth = 0;
    depth < maxCellNestingDepth && outputBytes > maxBytes;
    depth++
  ) {
    cellRegExp.lastIndex = 0;
    let cursor = 0;
    let changed = false;
    const pieces: string[] = [];
    let match: RegExpExecArray;

    while (outputBytes > maxBytes && (match = cellRegExp.exec(output))) {
      const matchBytes = Buffer.byteLength(match[0]);
      if (matchBytes <= ellipsisBytes) continue;
      pieces.push(output.substring(cursor, match.index), vdots);
      cursor = match.index + match[0].length;
      outputBytes -= matchBytes - ellipsisBytes;
      changed = true;
    }

    if (!changed) break;
    pieces.push(output.substring(cursor));
    output = pieces.join("");
  }

  return output;
};

const appendBoundedOutputHistory = function (
  currentOutput: string,
  incomingOutput: string,
  maxBytes: number,
  dropping: boolean,
  publicClient = false
): BoundedOutputHistory {
  if (maxBytes <= 0) return { output: "", dropping: true };

  if (dropping) {
    const end = incomingOutput.lastIndexOf(webAppTags.CellEnd);
    if (end < 0) return { output: ellipsisWithTail("", maxBytes), dropping };
    currentOutput = ellipsisWithTail("", maxBytes);
    incomingOutput = incomingOutput.substring(end + webAppTags.CellEnd.length);
    dropping = false;
  }

  let output = currentOutput + incomingOutput;
  if (Buffer.byteLength(output) <= maxBytes) return { output, dropping };

  if (publicClient) {
    const end = output.lastIndexOf(webAppTags.CellEnd);
    if (end >= 0) {
      output = ellipsisWithTail(
        output.substring(end + webAppTags.CellEnd.length),
        maxBytes
      );
      return { output, dropping: false };
    }
  } else {
    output = compactCompletedCells(output, maxBytes);
    if (Buffer.byteLength(output) <= maxBytes)
      return { output, dropping: false };
  }

  // The oversized portion is an unterminated cell. Stop retaining it until its
  // CellEnd arrives rather than allowing savedOutput to grow without bound.
  return { output: ellipsisWithTail("", maxBytes), dropping: true };
};

export {
  OutputLimitOptions,
  OutputLimitReason,
  OutputProtectionState,
  appendBoundedOutputHistory,
  beginOutputShutdown,
  chargeOutput,
  createOutputProtectionState,
  resetOutputForInput,
  resetOutputForProcess,
};
