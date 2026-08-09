import { createHash } from "node:crypto";
import { canonicalize } from "./canonicalize";

/** SHA-256 hex of canonical JSON payload. */
export function payloadHash(payload: unknown): string {
  const canonical = canonicalize(payload);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** Browser-safe variant using Web Crypto when available. */
export async function payloadHashWeb(payload: unknown): Promise<string> {
  const canonical = canonicalize(payload);
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const data = new TextEncoder().encode(canonical);
    const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return payloadHash(payload);
}

/** Semantic hash of projection state (excludes recorded_at / wall clock). */
export function semanticHash(value: unknown): string {
  return payloadHash(value);
}
