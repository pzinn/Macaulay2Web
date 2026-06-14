import childProcess = require("child_process");
import path = require("path");

type ExtractCallback = (error?: Error) => void;
type ExecFile = (
  file: string,
  args: string[],
  next: (error: Error | null, stdout?: string, stderr?: string) => void
) => void;

const isPathInside = function (
  basePath: string,
  candidatePath: string
): boolean {
  const relative = path.relative(basePath, candidatePath);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
};

const sanitizeTutorialFileName = function (fileName: string): string | null {
  if (!fileName) return null;
  const basename = path.basename(fileName);
  if (!basename || basename === "." || basename === "..") return null;
  return basename;
};

const hasUnsafeTarEntryPath = function (entryPath: string): boolean {
  if (!entryPath || entryPath.includes("\0")) return true;
  if (path.posix.isAbsolute(entryPath)) return true;
  if (/^[A-Za-z]:/.test(entryPath)) return true;
  const normalized = path.posix.normalize(entryPath);
  return normalized === ".." || normalized.startsWith("../");
};

const hasUnsafeTarEntryType = function (line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "") return false;
  const type = trimmed[0];
  return type === "l" || type === "h";
};

const extractTutorialArchive = function (
  archivePath: string,
  tutorialsFolder: string,
  next: ExtractCallback,
  execFile: ExecFile = childProcess.execFile
) {
  execFile("tar", ["-tvzf", archivePath], function (typeError, typeOut = "") {
    if (typeError) return next(typeError);
    if (typeOut.split("\n").some(hasUnsafeTarEntryType)) {
      return next(new Error("Archive contains unsupported link entries."));
    }

    execFile("tar", ["-tzf", archivePath], function (listError, stdout = "") {
      if (listError) return next(listError);
      const entries = stdout
        .split("\n")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      if (entries.some(hasUnsafeTarEntryPath)) {
        return next(new Error("Archive contains unsafe paths."));
      }
      execFile("tar", ["-xzf", archivePath, "-C", tutorialsFolder], next);
    });
  });
};

export {
  extractTutorialArchive,
  hasUnsafeTarEntryPath,
  hasUnsafeTarEntryType,
  isPathInside,
  sanitizeTutorialFileName,
};
