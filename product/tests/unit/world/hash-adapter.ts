/**
 * Node-only SHA-256 adapter for world kernel replay tests.
 * Must NOT be imported from product/src/modules/world barrel.
 */
import { createHash } from "node:crypto";
import { canonicalize } from "@/modules/world";

export function sha256Canonical(value: unknown): string {
  const canonical = canonicalize(value);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
