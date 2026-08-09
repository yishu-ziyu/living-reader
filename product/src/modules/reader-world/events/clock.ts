/**
 * Injectable clock / ID sources for deterministic tests.
 * Production defaults use crypto.randomUUID + Date.now.
 */

export type IdSource = () => string;
export type ClockSource = () => string; // RFC3339

let idSource: IdSource = defaultId;
let clockSource: ClockSource = defaultClock;

export function defaultId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `msg_${globalThis.crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `msg_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

export function defaultClock(): string {
  return new Date().toISOString();
}

export function setIdSource(fn: IdSource | null): void {
  idSource = fn ?? defaultId;
}

export function setClockSource(fn: ClockSource | null): void {
  clockSource = fn ?? defaultClock;
}

export function nextMessageId(): string {
  return idSource();
}

export function nowRfc3339(): string {
  return clockSource();
}

/** Test helper: sequential IDs and fixed clock. */
export function installTestSources(options?: {
  idPrefix?: string;
  fixedTime?: string;
}): { reset: () => void } {
  let n = 0;
  const prefix = options?.idPrefix ?? "msg_test_";
  const fixed = options?.fixedTime ?? "2026-08-08T12:00:00.000Z";
  setIdSource(() => `${prefix}${++n}`);
  setClockSource(() => fixed);
  return {
    reset: () => {
      setIdSource(null);
      setClockSource(null);
    },
  };
}
