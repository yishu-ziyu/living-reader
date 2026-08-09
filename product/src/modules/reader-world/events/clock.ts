/**
 * Injectable clock / ID sources for deterministic tests.
 * Production defaults use ULID + Date.now.
 */

export type IdSource = () => string;
export type ClockSource = () => string; // RFC3339
export type HybridLogicalClock = {
  physical_ms: number;
  logical: number;
};
export type EventMetadata = {
  hlc: HybridLogicalClock;
  device_id: string;
};
export type MetadataSource = (
  recordedAt: string,
  deviceId: string,
) => EventMetadata;
export type DeviceIdSource = () => string;
export type EventOrderMetadata = {
  hlc: HybridLogicalClock;
  device_id: string;
  message_id: string;
};

let idSource: IdSource = defaultId;
let clockSource: ClockSource = defaultClock;
let deviceIdSource: DeviceIdSource = defaultDeviceId;
let metadataSource: MetadataSource = defaultMetadata;

let lastPhysicalMs = -1;
let lastLogical = -1;

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(time: number): string {
  let value = time;
  let encoded = "";
  for (let i = 0; i < 10; i += 1) {
    encoded = CROCKFORD[value % 32]! + encoded;
    value = Math.floor(value / 32);
  }
  return encoded;
}

function randomIndex(): number {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const byte = new Uint8Array(1);
    globalThis.crypto.getRandomValues(byte);
    return byte[0]! & 31;
  }
  return Math.floor(Math.random() * 32);
}

export function defaultId(): string {
  const time = Date.now();
  if (!Number.isSafeInteger(time) || time < 0 || time >= 2 ** 48) {
    throw new Error("ULID timestamp must fit unsigned 48 bits");
  }
  let randomness = "";
  for (let i = 0; i < 16; i += 1) {
    randomness += CROCKFORD[randomIndex()]!;
  }
  return `${encodeTime(time)}${randomness}`;
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

export function defaultDeviceId(): string {
  return "local-device";
}

export function setDeviceIdSource(fn: DeviceIdSource | null): void {
  deviceIdSource = fn ?? defaultDeviceId;
}

export function setMetadataSource(fn: MetadataSource | null): void {
  metadataSource = fn ?? defaultMetadata;
}

export function resetHybridLogicalClock(): void {
  lastPhysicalMs = -1;
  lastLogical = -1;
}

export function defaultMetadata(
  recordedAt: string,
  deviceId: string,
): EventMetadata {
  const observedPhysicalMs = Date.parse(recordedAt);
  if (!Number.isSafeInteger(observedPhysicalMs) || observedPhysicalMs < 0) {
    throw new Error("recorded_at must be a valid RFC3339 timestamp");
  }

  if (observedPhysicalMs > lastPhysicalMs) {
    lastPhysicalMs = observedPhysicalMs;
    lastLogical = 0;
  } else {
    lastLogical += 1;
  }
  if (!Number.isSafeInteger(lastLogical)) {
    throw new Error("HLC logical counter exceeded safe integer range");
  }
  return {
    hlc: { physical_ms: lastPhysicalMs, logical: lastLogical },
    device_id: deviceId,
  };
}

export function nextMessageId(): string {
  return idSource();
}

export function nowRfc3339(): string {
  return clockSource();
}

export function nextEventMetadata(
  recordedAt: string,
  explicitDeviceId?: string,
): EventMetadata {
  const deviceId = explicitDeviceId ?? deviceIdSource();
  return metadataSource(recordedAt, deviceId);
}

/** Deterministic merge order for events that do not yet share a stream order. */
export function compareEventEnvelopeOrder(
  left: EventOrderMetadata,
  right: EventOrderMetadata,
): number {
  if (left.hlc.physical_ms !== right.hlc.physical_ms) {
    return left.hlc.physical_ms - right.hlc.physical_ms;
  }
  if (left.hlc.logical !== right.hlc.logical) {
    return left.hlc.logical - right.hlc.logical;
  }
  const deviceOrder = left.device_id.localeCompare(right.device_id);
  if (deviceOrder !== 0) return deviceOrder;
  return left.message_id.localeCompare(right.message_id);
}

/** Test helper: sequential IDs and fixed clock. */
export function installTestSources(options?: {
  idPrefix?: string;
  fixedTime?: string;
  deviceId?: string;
}): { reset: () => void } {
  let n = 0;
  const prefix = options?.idPrefix ?? "msg_test_";
  const fixed = options?.fixedTime ?? "2026-08-08T12:00:00.000Z";
  setIdSource(() => `${prefix}${++n}`);
  setClockSource(() => fixed);
  setDeviceIdSource(() => options?.deviceId ?? "local-device");
  setMetadataSource(null);
  resetHybridLogicalClock();
  return {
    reset: () => {
      setIdSource(null);
      setClockSource(null);
      setDeviceIdSource(null);
      setMetadataSource(null);
      resetHybridLogicalClock();
    },
  };
}
