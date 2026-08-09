import type {
  AppendEventsRequest,
  AppendReceipt,
  EventStore,
  IdempotencyReceipt,
} from "@/modules/reader-world/event-store";
import {
  storeErr,
  storeOk,
  type StoreResult,
} from "@/modules/reader-world/event-store";
import type { DomainEvent } from "@/modules/reader-world/events";
import {
  payloadHash,
  validateDomainEventDraft,
  validateStoredDomainEvent,
} from "@/modules/reader-world/events";

type StreamState = {
  events: unknown[];
  version: number;
};

export type InMemoryEventStoreOptions = {
  /** Replay/import seam for persisted v1/v2 rows. Rows are validated on load. */
  initial_events?: readonly unknown[];
};

type ReceiptKey = string;

function receiptKey(
  principal_id: string,
  experience_id: string,
  idempotency_key: string,
): ReceiptKey {
  return `${principal_id}\0${experience_id}\0${idempotency_key}`;
}

function requestPayloadHash(request: AppendEventsRequest): string {
  const bodies = request.events.map((e) => ({
    message_name: e.message_name,
    payload: e.payload,
  }));
  return payloadHash(bodies);
}

/** Deep-clone JSON-safe values so callers cannot mutate store internals. */
function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneDomainEvent(event: DomainEvent): DomainEvent {
  return deepClone(event);
}

function cloneReceipt(receipt: IdempotencyReceipt): IdempotencyReceipt {
  return {
    ...receipt,
    message_ids: [...receipt.message_ids],
    payload_hashes: [...receipt.payload_hashes],
  };
}

/**
 * In-memory EventStore — conformance reference for IndexedDB adapter.
 * Atomic within a single process tick (no partial event/receipt writes).
 */
export class InMemoryEventStore implements EventStore {
  private readonly streams = new Map<string, StreamState>();
  private readonly receipts = new Map<ReceiptKey, IdempotencyReceipt>();
  /** Global uniqueness of message_id across all streams (matches IDB unique index). */
  private readonly messageIds = new Set<string>();

  constructor(options?: InMemoryEventStoreOptions) {
    for (const raw of options?.initial_events ?? []) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("initial event must be an object");
      }
      const row = raw as Record<string, unknown>;
      if (
        typeof row.experience_id !== "string" ||
        !row.experience_id ||
        !Number.isSafeInteger(row.stream_version) ||
        (row.stream_version as number) < 1
      ) {
        throw new Error("initial event requires experience_id and stream_version");
      }
      const existing = this.streams.get(row.experience_id) ?? {
        events: [],
        version: 0,
      };
      existing.events.push(deepClone(raw));
      existing.version = Math.max(existing.version, row.stream_version as number);
      this.streams.set(row.experience_id, existing);
      if (typeof row.message_id === "string" && row.message_id) {
        this.messageIds.add(row.message_id);
      }
    }
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

    for (const draft of events) {
      const v = validateDomainEventDraft(draft);
      if (!v.ok) {
        return storeErr(v.error.code, v.error.message, {
          details: v.error.details,
        });
      }
      if (draft.experience_id !== experience_id) {
        return storeErr(
          "INVALID_ENVELOPE",
          "event experience_id must match request",
        );
      }
      if (draft.security.principal_id !== principal_id) {
        return storeErr(
          "INVALID_ENVELOPE",
          "event principal_id must match request",
        );
      }
    }

    const key = receiptKey(principal_id, experience_id, idempotency_key);
    const reqHash = requestPayloadHash(request);
    const existing = this.receipts.get(key);
    if (existing) {
      if (existing.payload_hash !== reqHash) {
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
      return storeOk({
        experience_id,
        previous_version: existing.previous_version,
        committed_version: existing.committed_version,
        message_ids: [...existing.message_ids],
        payload_hashes: [...existing.payload_hashes],
        duplicate: true,
      });
    }

    // Reject duplicate message_id within batch or already present in any stream.
    const batchIds = new Set<string>();
    for (const draft of events) {
      const mid = draft.message_id;
      if (batchIds.has(mid) || this.messageIds.has(mid)) {
        return storeErr(
          "DUPLICATE_MESSAGE_ID",
          "message_id already exists or is duplicated in batch",
          { details: { message_id: mid } },
        );
      }
      batchIds.add(mid);
    }

    const stream = this.streams.get(experience_id) ?? {
      events: [],
      version: 0,
    };
    const current = stream.version;
    // empty stream: only expected_version -1; non-empty: expected_version === current
    if (current === 0) {
      if (expected_version !== -1) {
        return storeErr(
          "EXPECTED_VERSION_MISMATCH",
          "empty stream requires expected_version -1",
          { current_version: 0 },
        );
      }
    } else if (expected_version !== current) {
      return storeErr(
        "EXPECTED_VERSION_MISMATCH",
        "expected_version does not match stream",
        { current_version: current },
      );
    }

    const previous_version = current === 0 ? -1 : current;
    const committed: DomainEvent[] = [];
    const message_ids: string[] = [];
    const payload_hashes: string[] = [];
    let version = current;

    for (let i = 0; i < events.length; i++) {
      const draft = events[i];
      const hash = draft.payload_hash ?? payloadHash(draft.payload);
      version += 1;
      // Deep-clone nested objects so later mutation of the draft cannot
      // rewrite committed history (payload, producer, security, arrays).
      const stored: DomainEvent = {
        protocol_version: draft.protocol_version,
        message_id: draft.message_id,
        message_type: "domain_event",
        message_name: draft.message_name,
        schema_version: draft.schema_version,
        experience_id: draft.experience_id,
        correlation_id: draft.correlation_id,
        causation_id: draft.causation_id,
        recorded_at: draft.recorded_at,
        hlc: deepClone(draft.hlc),
        device_id: draft.device_id,
        producer: deepClone(draft.producer),
        security: deepClone(draft.security),
        payload_hash: hash,
        payload: deepClone(draft.payload),
        stream_version: version,
        event_index_in_commit: i,
      } as DomainEvent;
      committed.push(stored);
      message_ids.push(stored.message_id);
      payload_hashes.push(hash);
    }

    // Atomic commit: mutate only after all validation
    const nextEvents = [...stream.events, ...committed];
    this.streams.set(experience_id, { events: nextEvents, version });
    for (const mid of message_ids) {
      this.messageIds.add(mid);
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
      first_recorded_at: committed[0]?.recorded_at ?? new Date().toISOString(),
    };
    this.receipts.set(key, receipt);

    return storeOk({
      experience_id,
      previous_version,
      committed_version: version,
      message_ids: [...message_ids],
      payload_hashes: [...payload_hashes],
      duplicate: false,
    });
  }

  async load(
    experience_id: string,
    options?: { after_version?: number },
  ): Promise<StoreResult<DomainEvent[]>> {
    const stream = this.streams.get(experience_id);
    if (!stream) {
      return storeOk([]);
    }
    const after = options?.after_version ?? 0;
    const loaded: DomainEvent[] = [];
    const ordered = [...stream.events].sort((a, b) => {
      const av = (a as { stream_version?: number }).stream_version ?? 0;
      const bv = (b as { stream_version?: number }).stream_version ?? 0;
      if (av !== bv) return av - bv;
      const ai = (a as { event_index_in_commit?: number }).event_index_in_commit ?? 0;
      const bi = (b as { event_index_in_commit?: number }).event_index_in_commit ?? 0;
      return ai - bi;
    });
    for (const raw of ordered) {
      const row = raw as { stream_version?: number };
      if ((row.stream_version ?? 0) <= after) continue;
      const validated = validateStoredDomainEvent(raw);
      if (!validated.ok) {
        return storeErr(validated.error.code, validated.error.message, {
          details: validated.error.details,
        });
      }
      loaded.push(cloneDomainEvent(validated.value));
    }
    return storeOk(loaded);
  }

  async getVersion(experience_id: string): Promise<StoreResult<number>> {
    const stream = this.streams.get(experience_id);
    return storeOk(stream?.version ?? 0);
  }

  async getIdempotencyReceipt(
    principal_id: string,
    experience_id: string,
    idempotency_key: string,
  ): Promise<StoreResult<IdempotencyReceipt | null>> {
    const r = this.receipts.get(
      receiptKey(principal_id, experience_id, idempotency_key),
    );
    return storeOk(r ? cloneReceipt(r) : null);
  }
}
