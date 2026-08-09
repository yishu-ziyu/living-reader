import { createHash } from "node:crypto";
import type { BodyNode } from "./types";

/** Stable content hash for drift detection (Node crypto). */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Canonical serialization of structured body for hashing. */
export function canonicalBody(body: BodyNode[]): string {
  return JSON.stringify(body);
}

export function sourceContentHash(body: BodyNode[], quote: string): string {
  return sha256Hex(`${canonicalBody(body)}\n---\n${quote}`);
}

/** Quote is only text nodes — never margin notes or footnote markers. */
export function quoteFromBody(body: BodyNode[]): string {
  return body
    .filter((n): n is Extract<BodyNode, { type: "text" }> => n.type === "text")
    .map((n) => n.text)
    .join("");
}
