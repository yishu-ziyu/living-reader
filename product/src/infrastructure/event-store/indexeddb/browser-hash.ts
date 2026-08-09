/**
 * Browser-safe SHA-256 of canonical JSON.
 * Mirrors events/hash.payloadHash without importing node:crypto
 * (which would break client bundles).
 */

import { canonicalize } from "@/modules/reader-world/events/canonicalize";

/** SHA-256 hex of canonical JSON payload (Web Crypto). */
export async function payloadHashBrowser(payload: unknown): Promise<string> {
  const canonical = canonicalize(payload);
  if (typeof globalThis.crypto?.subtle?.digest !== "function") {
    throw new Error(
      "Web Crypto subtle.digest unavailable; cannot hash in this environment",
    );
  }
  const data = new TextEncoder().encode(canonical);
  const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Semantic hash of a projection view (same algorithm as payload hash). */
export async function semanticViewHashBrowser(view: unknown): Promise<string> {
  return payloadHashBrowser(view);
}
