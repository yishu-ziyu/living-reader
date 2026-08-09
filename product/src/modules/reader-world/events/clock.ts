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

const lastHlcByDevice = new Map<string, HybridLogicalClock>();

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CANONICAL_ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const TEST_NAMESPACE_LENGTH = 8;
const TEST_SEQUENCE_LENGTH = 8;

export function isCanonicalUlid(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_ULID_PATTERN.test(value);
}

const DEVICE_ID_STORAGE_KEY = "living-reader.device-id.v1";
let fallbackDeviceId: string | null = null;
const HLC_WATERMARK_STORAGE_PREFIX = "living-reader.hlc-watermark.v1";

function watermarkStorageKey(deviceId: string): string {
  return `${HLC_WATERMARK_STORAGE_PREFIX}:${deviceId}`;
}

function isValidHlc(value: unknown): value is HybridLogicalClock {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(candidate.physical_ms) &&
    (candidate.physical_ms as number) >= 0 &&
    Number.isSafeInteger(candidate.logical) &&
    (candidate.logical as number) >= 0
  );
}

function readPersistedHlc(deviceId: string): HybridLogicalClock | null {
  try {
    const raw = globalThis.localStorage?.getItem(watermarkStorageKey(deviceId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidHlc(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writePersistedHlc(
  deviceId: string,
  watermark: HybridLogicalClock,
): void {
  try {
    globalThis.localStorage?.setItem(
      watermarkStorageKey(deviceId),
      JSON.stringify(watermark),
    );
  } catch {
    // In-memory monotonicity remains available when browser storage is blocked.
  }
}

function laterHlc(
  left: HybridLogicalClock | undefined,
  right: HybridLogicalClock | null,
): HybridLogicalClock | null {
  if (!left) return right;
  if (!right) return left;
  if (left.physical_ms !== right.physical_ms) {
    return left.physical_ms > right.physical_ms ? left : right;
  }
  return left.logical >= right.logical ? left : right;
}

function encodeTime(time: number): string {
  let value = time;
  let encoded = "";
  for (let i = 0; i < 10; i += 1) {
    encoded = CROCKFORD[value % 32]! + encoded;
    value = Math.floor(value / 32);
  }
  return encoded;
}

function encodeCrockford(value: number, length: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Crockford value must be a non-negative safe integer");
  }
  let remaining = value;
  let encoded = "";
  for (let i = 0; i < length; i += 1) {
    encoded = CROCKFORD[remaining % 32]! + encoded;
    remaining = Math.floor(remaining / 32);
  }
  if (remaining !== 0) {
    throw new Error(`Crockford value does not fit ${length} characters`);
  }
  return encoded;
}

function encodeUlidTime(time: number): string {
  if (!Number.isSafeInteger(time) || time < 0 || time >= 2 ** 48) {
    throw new Error("ULID timestamp must fit unsigned 48 bits");
  }
  return encodeTime(time);
}

function hashTestNamespace(namespace: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < namespace.length; i += 1) {
    hash ^= namespace.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createSequentialUlid(time: number, sequence: number): string {
  return `${encodeUlidTime(time)}${encodeCrockford(sequence, 16)}`;
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
  try {
    const storage = globalThis.localStorage;
    if (!storage) {
      fallbackDeviceId ??= `device_${defaultId()}`;
      return fallbackDeviceId;
    }
    const stored = storage.getItem(DEVICE_ID_STORAGE_KEY)?.trim();
    if (stored) return stored;
    const created = `device_${defaultId()}`;
    storage.setItem(DEVICE_ID_STORAGE_KEY, created);
    return created;
  } catch {
    fallbackDeviceId ??= `device_${defaultId()}`;
    return fallbackDeviceId;
  }
}

export function setDeviceIdSource(fn: DeviceIdSource | null): void {
  deviceIdSource = fn ?? defaultDeviceId;
}

export function setMetadataSource(fn: MetadataSource | null): void {
  metadataSource = fn ?? defaultMetadata;
}

export function resetHybridLogicalClock(): void {
  lastHlcByDevice.clear();
}

export function defaultMetadata(
  recordedAt: string,
  deviceId: string,
): EventMetadata {
  const observedPhysicalMs = Date.parse(recordedAt);
  if (!Number.isSafeInteger(observedPhysicalMs) || observedPhysicalMs < 0) {
    throw new Error("recorded_at must be a valid RFC3339 timestamp");
  }

  const previous = laterHlc(
    lastHlcByDevice.get(deviceId),
    readPersistedHlc(deviceId),
  );
  const hlc =
    previous && observedPhysicalMs <= previous.physical_ms
      ? {
          physical_ms: previous.physical_ms,
          logical: previous.logical + 1,
        }
      : { physical_ms: observedPhysicalMs, logical: 0 };
  if (!Number.isSafeInteger(hlc.logical)) {
    throw new Error("HLC logical counter exceeded safe integer range");
  }
  lastHlcByDevice.set(deviceId, hlc);
  writePersistedHlc(deviceId, hlc);
  return { hlc, device_id: deviceId };
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
  const timestamp = encodeUlidTime(Date.parse(fixed));
  // Preserve idPrefix as a deterministic namespace; canonical ULIDs cannot expose it verbatim.
  const namespace = encodeCrockford(hashTestNamespace(prefix), TEST_NAMESPACE_LENGTH);
  setIdSource(
    () => `${timestamp}${namespace}${encodeCrockford(++n, TEST_SEQUENCE_LENGTH)}`,
  );
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
