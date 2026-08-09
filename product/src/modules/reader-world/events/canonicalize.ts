/**
 * Canonical JSON for payload_hash.
 * Rules: recursive key sort, no whitespace, JSON numbers as produced by JSON,
 * Unicode code points as UTF-8 (no NFC force — preserve source strings).
 * recorded_at is never part of payload hash (hash only payload object).
 */

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("canonical JSON rejects non-finite numbers");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined) continue;
    out[k] = sortValue(v);
  }
  return out;
}
