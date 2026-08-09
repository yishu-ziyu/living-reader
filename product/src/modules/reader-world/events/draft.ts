import type { DomainEventName } from "./names";
import type { DomainEventPayloadByName } from "./payloads";
import type {
  DomainEventDraft,
  DomainEventDraftBase,
  Producer,
  SecurityContext,
} from "./envelope";
import { PROTOCOL_VERSION, schemaVersionForEventName } from "./names";
import {
  nextEventMetadata,
  nextMessageId,
  nowRfc3339,
  type HybridLogicalClock,
} from "./clock";
import { payloadHash } from "./hash";

export type CreateDraftInput<N extends DomainEventName> = {
  message_name: N;
  experience_id: string;
  correlation_id: string;
  causation_id?: string | null;
  producer: Producer;
  security: SecurityContext;
  payload: DomainEventPayloadByName[N];
  message_id?: string;
  recorded_at?: string;
  schema_version?: number;
  hlc?: HybridLogicalClock;
  device_id?: string;
};

/**
 * Build a DomainEvent draft ready for EventStore.append.
 * Store assigns stream_version / event_index_in_commit.
 */
export function createDomainEventDraft<N extends DomainEventName>(
  input: CreateDraftInput<N>,
): DomainEventDraftBase<N> {
  const hash = payloadHash(input.payload);
  const recordedAt = input.recorded_at ?? nowRfc3339();
  const metadata = input.hlc
    ? {
        hlc: input.hlc,
        device_id: input.device_id ?? "local-device",
      }
    : nextEventMetadata(recordedAt, input.device_id);
  return {
    protocol_version: PROTOCOL_VERSION,
    message_id: input.message_id ?? nextMessageId(),
    message_type: "domain_event",
    message_name: input.message_name,
    schema_version:
      input.schema_version ?? schemaVersionForEventName(input.message_name),
    experience_id: input.experience_id,
    correlation_id: input.correlation_id,
    causation_id: input.causation_id ?? null,
    recorded_at: recordedAt,
    hlc: metadata.hlc,
    device_id: metadata.device_id,
    producer: input.producer,
    security: input.security,
    payload_hash: hash,
    payload: input.payload,
  };
}

/** Widen a typed draft to the DomainEventDraft union for store append arrays. */
export function asDomainEventDraft<N extends DomainEventName>(
  draft: DomainEventDraftBase<N>,
): DomainEventDraft {
  return draft as DomainEventDraft;
}
