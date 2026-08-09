import { describe, expect, it } from "vitest";
import { createBrowserIdPort } from "@/modules/reader-thinking";

const CANONICAL_ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

describe("reader-thinking identity ports", () => {
  it("gives two fresh browser ports distinct canonical ULIDs", () => {
    const first = createBrowserIdPort().nextId("msg");
    const second = createBrowserIdPort().nextId("msg");

    expect(first).toMatch(CANONICAL_ULID_PATTERN);
    expect(second).toMatch(CANONICAL_ULID_PATTERN);
    expect(second).not.toBe(first);
  });
});
