// @vitest-environment node

import path = require("path");
import { describe, expect, it, vi } from "vitest";

import {
  extractTutorialArchive,
  hasUnsafeTarEntryPath,
  hasUnsafeTarEntryType,
  isPathInside,
  sanitizeTutorialFileName,
} from "../tutorialArchive";

const extract = function (
  archivePath: string,
  tutorialsFolder: string,
  execFile
): Promise<void> {
  return new Promise((resolve, reject) => {
    extractTutorialArchive(
      archivePath,
      tutorialsFolder,
      (error) => (error ? reject(error) : resolve()),
      execFile
    );
  });
};

describe("tutorial archive validation", () => {
  it("accepts nested relative paths but rejects traversal and absolute paths", () => {
    expect(hasUnsafeTarEntryPath("lesson/images/plot.png")).toBe(false);
    expect(hasUnsafeTarEntryPath("./lesson/index.html")).toBe(false);
    expect(hasUnsafeTarEntryPath("../outside")).toBe(true);
    expect(hasUnsafeTarEntryPath("lesson/../../outside")).toBe(true);
    expect(hasUnsafeTarEntryPath("/etc/passwd")).toBe(true);
    expect(hasUnsafeTarEntryPath("C:/Windows/system.ini")).toBe(true);
    expect(hasUnsafeTarEntryPath("lesson/\0file")).toBe(true);
  });

  it("rejects symbolic and hard links", () => {
    expect(hasUnsafeTarEntryType("lrwxrwxrwx user/group link -> target")).toBe(
      true
    );
    expect(hasUnsafeTarEntryType("hrw-r--r-- user/group hardlink")).toBe(true);
    expect(
      hasUnsafeTarEntryType("-rw-r--r-- user/group lesson/index.html")
    ).toBe(false);
    expect(hasUnsafeTarEntryType("drwxr-xr-x user/group lesson/")).toBe(false);
  });

  it("extracts a validated archive directly into tutorials", async () => {
    const archivePath = "/tmp/tutorial.tar.gz";
    const tutorialsFolder = "/srv/public/tutorials";
    const execFile = vi
      .fn()
      .mockImplementationOnce((file, args, next) =>
        next(
          null,
          "drwxr-xr-x user/group lesson/\n-rw-r--r-- user/group lesson/index.html\n"
        )
      )
      .mockImplementationOnce((file, args, next) =>
        next(null, "lesson/\nlesson/index.html\n")
      )
      .mockImplementationOnce((file, args, next) => next(null, ""));

    await extract(archivePath, tutorialsFolder, execFile);

    expect(execFile.mock.calls).toEqual([
      ["tar", ["-tvzf", archivePath], expect.any(Function)],
      ["tar", ["-tzf", archivePath], expect.any(Function)],
      [
        "tar",
        ["-xzf", archivePath, "-C", tutorialsFolder],
        expect.any(Function),
      ],
    ]);
  });

  it("does not extract an archive containing traversal", async () => {
    const execFile = vi
      .fn()
      .mockImplementationOnce((file, args, next) =>
        next(null, "-rw-r--r-- user/group ../outside\n")
      )
      .mockImplementationOnce((file, args, next) => next(null, "../outside\n"));

    await expect(
      extract("/tmp/bad.tar.gz", "/srv/tutorials", execFile)
    ).rejects.toThrow("unsafe paths");
    expect(execFile).toHaveBeenCalledTimes(2);
  });

  it("does not list or extract an archive containing links", async () => {
    const execFile = vi.fn((file, args, next) =>
      next(null, "lrwxrwxrwx user/group escape -> ../../outside\n")
    );

    await expect(
      extract("/tmp/link.tar.gz", "/srv/tutorials", execFile)
    ).rejects.toThrow("unsupported link entries");
    expect(execFile).toHaveBeenCalledTimes(1);
  });

  it("sanitizes upload names and confines their resolved targets", () => {
    const tutorials = path.resolve("/srv/public/tutorials");
    const safeName = sanitizeTutorialFileName("../../sample.tar.gz");
    expect(safeName).toBe("sample.tar.gz");
    expect(isPathInside(tutorials, path.resolve(tutorials, safeName))).toBe(
      true
    );
    expect(isPathInside(tutorials, path.resolve(tutorials, "../outside"))).toBe(
      false
    );
    expect(sanitizeTutorialFileName("..")).toBeNull();
  });
});
