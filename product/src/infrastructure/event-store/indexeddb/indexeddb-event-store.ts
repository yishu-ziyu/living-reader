/**
 * IndexedDB EventStore adapter — production browser persistence.
 * Semantics match InMemoryEventStore (conformance reference).
 *
 * Hashing uses Web Crypto (browser-hash) so this module never imports
 * node:crypto and stays client-bundle safe.
 */

import type {
  AppendEventsRequest,
  AppendReceipt,
  EventStore,
  IdempotencyReceipt,
} from "@/modules/reader-world/event-store/port";
import {
  storeErr,
  storeOk,
  type StoreResult,
} from "@/modules/reader-world/event-store/errors";
import type {
  DomainEvent,
  DomainEventDraft,
} from "@/modules/reader-world/events/envelope";
import {
  DOMAIN_EVENT_NAME_SET,
  PROTOCOL_VERSION,
} from "@/modules/reader-world/events/names";
import type { DomainEventName } from "@/modules/reader-world/events/names";
import { exportDebugTrace } from "@/modules/reader-world/events/debug-trace";
import { validateEventPayload } from "@/modules/reader-world/events/payload-schema";
import {
  validateProducerShape,
  validateRootEnvelopeKeys,
  validateSecurityShape,
} from "@/modules/reader-world/events/envelope-allowlist";
import { payloadHashBrowser } from "./browser-hash";
import {
  clearProjections,
  loadProjections,
  rebuildAndPersist,
  saveProjections as persistProjections,
  type LoadedProjections,
  type RebuildPersistResult,
} from "./projection-persist";
import {
  deleteReaderWorldDatabase,
  idbRequest,
  idbTransactionDone,
  INDEX_BY_EXPERIENCE,
  INDEX_BY_MESSAGE_ID,
  openDatabase,
  READER_WORLD_IDB_NAME,
  READER_WORLD_IDB_VERSION,
  STORE_EVENTS,
  STORE_RECEIPTS,
} from "./schema";

export { READER_WORLD_IDB_NAME, READER_WORLD_IDB_VERSION };

export type IndexedDbEventStoreOptions = {
  /** Override DB name (tests). Default: READER_WORLD_IDB_NAME. */
  dbName?: string;
  /** Override DB version (tests). Default: READER_WORLD_IDB_VERSION. */
  dbVersion?: number;
};

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

type DraftValidationCode =
  | "INVALID_ENVELOPE"
  | "UNKNOWN_MESSAGE_NAME"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "PAYLOAD_HASH_MISMATCH"
  | "INVALID_PAYLOAD"
  | "STORE_UNAVAILABLE";

type DraftValidationResult =
  | { ok: true; value: DomainEventDraft; payload_hash: string }
  | {
      ok: false;
      code: DraftValidationCode;
      message: string;
      details?: Record<string, unknown>;
    };

/**
 * Browser-side validate aligned with validateDomainEventDraft (F21 fail-closed).
 * Exact envelope/producer/security allowlists + Web Crypto hash (no node:crypto).
 */
async function validateDraftBrowser(
  raw: unknown,
): Promise<DraftValidationResult> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, code: "INVALID_ENVELOPE", message: "event must be an object" };
  }
  const e = raw as Record<string, unknown>;

  const rootKeys = validateRootEnvelopeKeys(e, "draft");
  if (!rootKeys.ok) {
    return {
      ok: false,
      code: rootKeys.error.code,
      message: rootKeys.error.message,
      details: rootKeys.error.details,
    };
  }

  if (e.protocol_version !== PROTOCOL_VERSION) {
    return {
      ok: false,
      code: "INVALID_ENVELOPE",
      message: "protocol_version mismatch",
      details: { protocol_version: e.protocol_version },
    };
  }
  if (e.message_type !== "domain_event") {
    return {
      ok: false,
      code: "INVALID_ENVELOPE",
      message: "message_type must be domain_event",
    };
  }
  if (!nonEmptyString(e.message_id)) {
    return { ok: false, code: "INVALID_ENVELOPE", message: "message_id required" };
  }
  if (
    !nonEmptyString(e.message_name) ||
    !DOMAIN_EVENT_NAME_SET.has(e.message_name)
  ) {
    return {
      ok: false,
      code: "UNKNOWN_MESSAGE_NAME",
      message: "unknown or unfrozen message_name",
      details: { message_name: e.message_name },
    };
  }
  const messageName = e.message_name as DomainEventName;
  if (e.schema_version !== 1) {
    return {
      ok: false,
      code: "UNSUPPORTED_SCHEMA_VERSION",
      message: "only schema_version 1 is supported",
      details: { schema_version: e.schema_version },
    };
  }
  if (!nonEmptyString(e.experience_id)) {
    return {
      ok: false,
      code: "INVALID_ENVELOPE",
      message: "experience_id required",
    };
  }
  if (!nonEmptyString(e.correlation_id)) {
    return {
      ok: false,
      code: "INVALID_ENVELOPE",
      message: "correlation_id required",
    };
  }
  if (e.causation_id !== null && !nonEmptyString(e.causation_id)) {
    return {
      ok: false,
      code: "INVALID_ENVELOPE",
      message: "causation_id must be string or null",
    };
  }
  if (!nonEmptyString(e.recorded_at)) {
    return {
      ok: false,
      code: "INVALID_ENVELOPE",
      message: "recorded_at required",
    };
  }

  const producerCheck = validateProducerShape(e.producer);
  if (!producerCheck.ok) {
    return {
      ok: false,
      code: producerCheck.error.code,
      message: producerCheck.error.message,
      details: producerCheck.error.details,
    };
  }

  const securityCheck = validateSecurityShape(e.security);
  if (!securityCheck.ok) {
    return {
      ok: false,
      code: securityCheck.error.code,
      message: securityCheck.error.message,
      details: securityCheck.error.details,
    };
  }

  if (e.payload === null || typeof e.payload !== "object" || Array.isArray(e.payload)) {
    return {
      ok: false,
      code: "INVALID_PAYLOAD",
      message: "payload must be an object",
    };
  }

  const payloadCheck = validateEventPayload(messageName, e.payload);
  if (!payloadCheck.ok) {
    return {
      ok: false,
      code: payloadCheck.error.code,
      message: payloadCheck.error.message,
      details: payloadCheck.error.details,
    };
  }

  if (
    e.payload_hash === undefined ||
    e.payload_hash === null ||
    e.payload_hash === ""
  ) {
    return {
      ok: false,
      code: "INVALID_ENVELOPE",
      message: "payload_hash required",
    };
  }
  if (!nonEmptyString(e.payload_hash)) {
    return {
      ok: false,
      code: "INVALID_ENVELOPE",
      message: "payload_hash must be a non-empty string",
    };
  }

  let expectedHash: string;
  try {
    expectedHash = await payloadHashBrowser(e.payload);
  } catch (err) {
    return {
      ok: false,
      code: "STORE_UNAVAILABLE",
      message: err instanceof Error ? err.message : "hash unavailable",
    };
  }

  if (e.payload_hash !== expectedHash) {
    return {
      ok: false,
      code: "PAYLOAD_HASH_MISMATCH",
      message: "payload_hash does not match payload",
      details: { expectedHash, payload_hash: e.payload_hash },
    };
  }

  return {
    ok: true,
    value: e as unknown as DomainEventDraft,
    payload_hash: expectedHash,
  };
}

async function requestPayloadHash(
  request: AppendEventsRequest,
): Promise<string> {
  const bodies = request.events.map((e) => ({
    message_name: e.message_name,
    payload: e.payload,
  }));
  return payloadHashBrowser(bodies);
}

/**
 * IndexedDB-backed EventStore.
 * append commits events + receipt in ONE readwrite transaction.
 */
export class IndexedDbEventStore implements EventStore {
  private readonly dbName: string;
  private readonly dbVersion: number;
  private db: IDBDatabase | null = null;

  /**
   * Test-only fault hook (bridge / e2e).
   * When true, append aborts after validation + version check and before any put,
   * so events and receipts stay clean (zero half-writes).
   * Production code must never set this; bridge exposes setTestAbortBeforePut.
   */
  __testAbortBeforePut = false;

  constructor(options?: IndexedDbEventStoreOptions) {
    this.dbName = options?.dbName ?? READER_WORLD_IDB_NAME;
    this.dbVersion = options?.dbVersion ?? READER_WORLD_IDB_VERSION;
  }

  /** Open (or reuse) the underlying IDB connection. */
  async open(): Promise<void> {
    if (this.db) return;
    try {
      this.db = await openDatabase(this.dbName, this.dbVersion);
      this.db.onversionchange = () => {
        this.db?.close();
        this.db = null;
      };
    } catch (err) {
      throw err;
    }
  }

  /** Close the connection (call before deleteDatabase in tests). */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private async ensureDb(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.open();
    }
    if (!this.db) {
      throw new Error("IndexedDB connection unavailable");
    }
    return this.db;
  }

  private unavailable(message: string): StoreResult<never> {
    return storeErr("STORE_UNAVAILABLE", message);
  }

  async append(
    request: AppendEventsRequest,
  ): Promise<StoreResult<AppendReceipt>> {
    const {
      experience_id,
      principal_id,
      idempotency_key,
      expected_version,
      events,
    } = request;

    if (!experience_id || !principal_id || !idempotency_key) {
      return storeErr("INVALID_ENVELOPE", "missing append identity fields");
    }
    if (!Array.isArray(events) || events.length === 0) {
      return storeErr("INVALID_PAYLOAD", "events must be a non-empty array");
    }

    // Validate all drafts before opening the write transaction.
    const validated: Array<{ draft: DomainEventDraft; hash: string }> = [];
    for (const draft of events) {
      const v = await validateDraftBrowser(draft);
      if (!v.ok) {
        if (v.code === "STORE_UNAVAILABLE") {
          return this.unavailable(v.message);
        }
        return storeErr(v.code, v.message, { details: v.details });
      }
      if (v.value.experience_id !== experience_id) {
        return storeErr(
          "INVALID_ENVELOPE",
          "event experience_id must match request",
        );
      }
      if (v.value.security.principal_id !== principal_id) {
        return storeErr(
          "INVALID_ENVELOPE",
          "event principal_id must match request",
        );
      }
      validated.push({ draft: v.value, hash: v.payload_hash });
    }

    let reqHash: string;
    try {
      reqHash = await requestPayloadHash(request);
    } catch (err) {
      return this.unavailable(
        err instanceof Error ? err.message : "request hash failed",
      );
    }

    let db: IDBDatabase;
    try {
      db = await this.ensureDb();
    } catch (err) {
      return this.unavailable(
        err instanceof Error ? err.message : "IndexedDB open failed",
      );
    }

    try {
      const tx = db.transaction([STORE_EVENTS, STORE_RECEIPTS], "readwrite");
      const eventsStore = tx.objectStore(STORE_EVENTS);
      const receiptsStore = tx.objectStore(STORE_RECEIPTS);
      const byExperience = eventsStore.index(INDEX_BY_EXPERIENCE);

      // Idempotency receipt first
      const existing = (await idbRequest(
        receiptsStore.get([principal_id, experience_id, idempotency_key]),
      )) as IdempotencyReceipt | undefined;

      if (existing) {
        if (existing.payload_hash !== reqHash) {
          // Abort intentionally — no writes issued yet beyond the get.
          tx.abort();
          return storeErr(
            "IDEMPOTENCY_KEY_REUSED",
            "idempotency key reused with different payload",
            {
              details: {
                existing_payload_hash: existing.payload_hash,
                request_payload_hash: reqHash,
              },
            },
          );
        }
        // Duplicate success path — no new writes; complete the read tx.
        await idbTransactionDone(tx);
        return storeOk({
          experience_id,
          previous_version: existing.previous_version,
          committed_version: existing.committed_version,
          message_ids: [...existing.message_ids],
          payload_hashes: [...(existing.payload_hashes ?? [])],
          duplicate: true,
        });
      }

      // Current stream version
      const existingEvents = (await idbRequest(
        byExperience.getAll(experience_id),
      )) as DomainEvent[];
      let current = 0;
      for (const e of existingEvents) {
        if (e.stream_version > current) current = e.stream_version;
      }

      if (current === 0 && expected_version !== -1) {
        tx.abort();
        return storeErr(
          "EXPECTED_VERSION_MISMATCH",
          "empty stream requires expected_version -1",
          { current_version: 0 },
        );
      }
      if (current > 0 && expected_version !== current) {
        tx.abort();
        return storeErr(
          "EXPECTED_VERSION_MISMATCH",
          "expected_version does not match stream",
          { current_version: current },
        );
      }

      // Reject duplicate message_id within batch or already in store (F23 parity).
      const byMessageId = eventsStore.index(INDEX_BY_MESSAGE_ID);
      const batchIds = new Set<string>();
      for (const { draft } of validated) {
        const mid = draft.message_id;
        if (batchIds.has(mid)) {
          tx.abort();
          return storeErr(
            "DUPLICATE_MESSAGE_ID",
            "duplicate message_id within batch",
            { details: { message_id: mid } },
          );
        }
        batchIds.add(mid);
        const found = await idbRequest(byMessageId.get(mid));
        if (found) {
          tx.abort();
          return storeErr(
            "DUPLICATE_MESSAGE_ID",
            "message_id already exists in EventStore",
            { details: { message_id: mid } },
          );
        }
      }

      // Test-only: abort after validation/version check, before put.
      if (this.__testAbortBeforePut) {
        tx.abort();
        return storeErr(
          "STORE_UNAVAILABLE",
          "test abort before put (zero half-writes)",
        );
      }

      const previous_version = current === 0 ? -1 : current;
      const message_ids: string[] = [];
      const payload_hashes: string[] = [];
      let version = current;

      for (let i = 0; i < validated.length; i++) {
        const { draft, hash } = validated[i];
        version += 1;
        // structured clone so nested objects are not shared with caller
        const stored: DomainEvent = structuredClone({
          protocol_version: draft.protocol_version,
          message_id: draft.message_id,
          message_type: "domain_event" as const,
          message_name: draft.message_name,
          schema_version: draft.schema_version,
          experience_id: draft.experience_id,
          correlation_id: draft.correlation_id,
          causation_id: draft.causation_id,
          recorded_at: draft.recorded_at,
          producer: draft.producer,
          security: draft.security,
          payload_hash: hash,
          payload: draft.payload,
          stream_version: version,
          event_index_in_commit: i,
        }) as DomainEvent;
        eventsStore.put(stored);
        message_ids.push(stored.message_id);
        payload_hashes.push(hash);
      }

      const receipt: IdempotencyReceipt = {
        principal_id,
        experience_id,
        idempotency_key,
        payload_hash: reqHash,
        previous_version,
        committed_version: version,
        message_ids: [...message_ids],
        payload_hashes: [...payload_hashes],
        first_recorded_at:
          validated[0]?.draft.recorded_at ?? new Date().toISOString(),
      };
      receiptsStore.put(receipt);

      await idbTransactionDone(tx);

      return storeOk({
        experience_id,
        previous_version,
        committed_version: version,
        message_ids,
        payload_hashes,
        duplicate: false,
      });
    } catch (err) {
      return this.unavailable(
        err instanceof Error ? err.message : "append transaction failed",
      );
    }
  }

  async load(
    experience_id: string,
    options?: { after_version?: number },
  ): Promise<StoreResult<DomainEvent[]>> {
    let db: IDBDatabase;
    try {
      db = await this.ensureDb();
    } catch (err) {
      return this.unavailable(
        err instanceof Error ? err.message : "IndexedDB open failed",
      );
    }

    try {
      const tx = db.transaction([STORE_EVENTS], "readonly");
      const byExperience = tx.objectStore(STORE_EVENTS).index(INDEX_BY_EXPERIENCE);
      const rows = (await idbRequest(
        byExperience.getAll(experience_id),
      )) as DomainEvent[];
      await idbTransactionDone(tx);

      const after = options?.after_version ?? 0;
      const filtered = rows
        .filter((e) => e.stream_version > after)
        .sort((a, b) => {
          if (a.stream_version !== b.stream_version) {
            return a.stream_version - b.stream_version;
          }
          return a.event_index_in_commit - b.event_index_in_commit;
        })
        .map((e) => ({ ...e }));

      return storeOk(filtered);
    } catch (err) {
      return this.unavailable(
        err instanceof Error ? err.message : "load failed",
      );
    }
  }

  async getVersion(experience_id: string): Promise<StoreResult<number>> {
    let db: IDBDatabase;
    try {
      db = await this.ensureDb();
    } catch (err) {
      return this.unavailable(
        err instanceof Error ? err.message : "IndexedDB open failed",
      );
    }

    try {
      const tx = db.transaction([STORE_EVENTS], "readonly");
      const byExperience = tx.objectStore(STORE_EVENTS).index(INDEX_BY_EXPERIENCE);
      const rows = (await idbRequest(
        byExperience.getAll(experience_id),
      )) as DomainEvent[];
      await idbTransactionDone(tx);

      let current = 0;
      for (const e of rows) {
        if (e.stream_version > current) current = e.stream_version;
      }
      return storeOk(current);
    } catch (err) {
      return this.unavailable(
        err instanceof Error ? err.message : "getVersion failed",
      );
    }
  }

  async getIdempotencyReceipt(
    principal_id: string,
    experience_id: string,
    idempotency_key: string,
  ): Promise<StoreResult<IdempotencyReceipt | null>> {
    let db: IDBDatabase;
    try {
      db = await this.ensureDb();
    } catch (err) {
      return this.unavailable(
        err instanceof Error ? err.message : "IndexedDB open failed",
      );
    }

    try {
      const tx = db.transaction([STORE_RECEIPTS], "readonly");
      const row = (await idbRequest(
        tx
          .objectStore(STORE_RECEIPTS)
          .get([principal_id, experience_id, idempotency_key]),
      )) as IdempotencyReceipt | undefined;
      await idbTransactionDone(tx);
      return storeOk(
        row ? { ...row, message_ids: [...row.message_ids] } : null,
      );
    } catch (err) {
      return this.unavailable(
        err instanceof Error ? err.message : "getIdempotencyReceipt failed",
      );
    }
  }

  // --- Projection helpers ---

  async saveProjections(
    result: RebuildPersistResult,
    events?: readonly DomainEvent[],
  ): Promise<StoreResult<true>> {
    try {
      const db = await this.ensureDb();
      await persistProjections(db, result, events);
      return storeOk(true);
    } catch (err) {
      return this.unavailable(
        err instanceof Error ? err.message : "saveProjections failed",
      );
    }
  }

  async loadProjections(
    experience_id: string,
  ): Promise<StoreResult<LoadedProjections | null>> {
    try {
      const db = await this.ensureDb();
      const value = await loadProjections(db, experience_id);
      return storeOk(value);
    } catch (err) {
      return this.unavailable(
        err instanceof Error ? err.message : "loadProjections failed",
      );
    }
  }

  /**
   * Clear projection_* stores only (events + receipts preserved).
   */
  async clearProjections(
    experience_id?: string,
  ): Promise<StoreResult<true>> {
    try {
      const db = await this.ensureDb();
      await clearProjections(db, experience_id);
      return storeOk(true);
    } catch (err) {
      return this.unavailable(
        err instanceof Error ? err.message : "clearProjections failed",
      );
    }
  }

  /**
   * Rebuild projections from the event stream and persist them.
   * After clearProjections + rebuildFromEvents, hashes must match prior values.
   */
  async rebuildFromEvents(
    experience_id: string,
  ): Promise<StoreResult<RebuildPersistResult>> {
    const loaded = await this.load(experience_id);
    if (!loaded.ok) return loaded;

    try {
      const db = await this.ensureDb();
      const result = await rebuildAndPersist(db, experience_id, loaded.value);
      return storeOk(result);
    } catch (err) {
      return this.unavailable(
        err instanceof Error ? err.message : "rebuildFromEvents failed",
      );
    }
  }

  /**
   * Public debug trace JSON for an experience.
   * Never includes authentication_context / prompts / credentials / raw_audio.
   */
  async exportDebugTraceJson(
    experience_id: string,
  ): Promise<StoreResult<string>> {
    const loaded = await this.load(experience_id);
    if (!loaded.ok) return loaded;
    const trace = exportDebugTrace(loaded.value);
    return storeOk(JSON.stringify(trace));
  }

  /**
   * Delete the entire database (test cleanup).
   * Closes this instance's connection first.
   */
  async deleteDatabase(): Promise<void> {
    this.close();
    await deleteReaderWorldDatabase(this.dbName);
  }

  /** Static helper for test cleanup without an instance. */
  static async deleteDatabase(
    name: string = READER_WORLD_IDB_NAME,
  ): Promise<void> {
    await deleteReaderWorldDatabase(name);
  }
}
