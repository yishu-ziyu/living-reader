import type { DomainEventName } from "./names";
import type { DomainEventPayloadByName } from "./payloads";
import type { HybridLogicalClock } from "./clock";

export type Producer = {
  module: "reader_world" | "voice_session" | "llm_proposer" | string;
  instance: string;
};

export type SecurityContext = {
  principal_id: string;
  authority: "reader" | "operator" | "system" | "external_data";
  /** Opaque; never exported in debug traces. */
  authentication_context?: string;
  integrity: "local" | "signed_remote";
};

/**
 * Canonical DomainEvent envelope (reader-world-protocol/v2).
 * Field names are snake_case per architecture contract.
 */
export type DomainEventEnvelope<N extends DomainEventName = DomainEventName> = {
  protocol_version: "reader-world-protocol/v2";
  message_id: string;
  message_type: "domain_event";
  message_name: N;
  schema_version: number;
  experience_id: string;
  correlation_id: string;
  causation_id: string | null;
  recorded_at: string;
  hlc: HybridLogicalClock;
  device_id: string;
  producer: Producer;
  security: SecurityContext;
  payload_hash: string;
  payload: DomainEventPayloadByName[N];
  stream_version: number;
  event_index_in_commit: number;
};

/** Persisted v1 shape accepted only by load-time deterministic upcasting. */
export type LegacyDomainEventEnvelope<
  N extends DomainEventName = DomainEventName,
> = Omit<DomainEventEnvelope<N>, "protocol_version" | "hlc" | "device_id"> & {
  protocol_version: "reader-world-protocol/v1";
};

/**
 * Discriminated union over frozen message_name so switch/case narrows payload.
 */
export type DomainEvent = {
  [K in DomainEventName]: DomainEventEnvelope<K>;
}[DomainEventName];

/** Input before store assigns stream_version / event_index_in_commit. */
export type DomainEventDraftBase<N extends DomainEventName = DomainEventName> =
  Omit<
    DomainEventEnvelope<N>,
    "stream_version" | "event_index_in_commit" | "payload_hash"
  > & {
    payload_hash?: string;
  };

export type DomainEventDraft = {
  [K in DomainEventName]: DomainEventDraftBase<K>;
}[DomainEventName];

export type StoredDomainEventInput =
  | DomainEvent
  | {
      [K in DomainEventName]: LegacyDomainEventEnvelope<K>;
    }[DomainEventName];
