const shellQuote = function (value: string): string {
  // Single-quote shell escaping: abc'def -> 'abc'"'"'def'
  return "'" + value.replace(/'/g, "'\"'\"'") + "'";
};

const normalizeInstancePath = function (
  fileName: string,
  baseDirectory: string
): string | null {
  if (!fileName || fileName === "." || fileName === "./") return null;
  if (fileName.indexOf("\0") >= 0) return null;
  if (fileName.startsWith("tutorials/") || fileName === "tutorials")
    return null;
  if (!fileName.startsWith("/")) return baseDirectory + fileName;
  return fileName;
};

const instanceDownloadCandidates = function (
  sourceFileName: string,
  baseDirectory: string
): string[] {
  if (sourceFileName === "/") return ["/"];
  if (!sourceFileName.startsWith("/")) return [baseDirectory + sourceFileName];
  return [baseDirectory + sourceFileName.substring(1), sourceFileName];
};

export { instanceDownloadCandidates, normalizeInstancePath, shellQuote };
