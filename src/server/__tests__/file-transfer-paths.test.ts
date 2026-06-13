// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  instanceDownloadCandidates,
  normalizeInstancePath,
  shellQuote,
} from "../fileTransferPaths";

describe("instance file transfer paths", () => {
  const baseDirectory = "/home/m2user/";

  it("resolves relative deletion paths and preserves absolute paths", () => {
    expect(normalizeInstancePath("work/example.m2", baseDirectory)).toBe(
      "/home/m2user/work/example.m2"
    );
    expect(
      normalizeInstancePath("/usr/share/Macaulay2/file.m2", baseDirectory)
    ).toBe("/usr/share/Macaulay2/file.m2");
  });

  it("rejects protected, empty, and malformed deletion targets", () => {
    expect(normalizeInstancePath("", baseDirectory)).toBeNull();
    expect(normalizeInstancePath(".", baseDirectory)).toBeNull();
    expect(normalizeInstancePath("./", baseDirectory)).toBeNull();
    expect(normalizeInstancePath("tutorials", baseDirectory)).toBeNull();
    expect(
      normalizeInstancePath("tutorials/example.m2", baseDirectory)
    ).toBeNull();
    expect(normalizeInstancePath("bad\0name", baseDirectory)).toBeNull();
  });

  it("tries both base-relative and absolute interpretations when downloading", () => {
    expect(instanceDownloadCandidates("work/file.m2", baseDirectory)).toEqual([
      "/home/m2user/work/file.m2",
    ]);
    expect(
      instanceDownloadCandidates("/usr/share/Macaulay2/file.m2", baseDirectory)
    ).toEqual([
      "/home/m2user/usr/share/Macaulay2/file.m2",
      "/usr/share/Macaulay2/file.m2",
    ]);
    expect(instanceDownloadCandidates("/", baseDirectory)).toEqual(["/"]);
  });

  it("quotes archive names safely for the remote shell", () => {
    expect(shellQuote("/home/m2user/tutorial.tar.gz")).toBe(
      "'/home/m2user/tutorial.tar.gz'"
    );
    expect(shellQuote("/home/m2user/user's tutorial.tar.gz")).toBe(
      "'/home/m2user/user'\"'\"'s tutorial.tar.gz'"
    );
  });
});
