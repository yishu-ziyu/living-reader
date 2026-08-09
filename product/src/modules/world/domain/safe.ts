/** Shared fail-closed number/object helpers (T008 rework). */

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  // Reject prototype-chain inheritance bypass (Object.create(null) ok; subclass no)
  return proto === Object.prototype || proto === null;
}

export function isSafeInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v);
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

export function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  Object.freeze(obj);
  for (const v of Object.values(obj as object)) {
    if (v && typeof v === "object" && !Object.isFrozen(v)) {
      deepFreeze(v);
    }
  }
  return obj;
}
