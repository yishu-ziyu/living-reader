/**
 * Browser-safe DomainEvent draft factory (no node:crypto).
 * Uses Web Crypto subtle.digest for payload_hash.
 */
import type { DomainEventName } from "@/modules/reader-world/events/names";
import type { DomainEventPayloadByName } from "@/modules/reader-world/events/payloads";
import type {
  DomainEventDraftBase,
  Producer,
  SecurityContext,
} from "@/modules/reader-world/events/envelope";
import {
  PROTOCOL_VERSION,
  schemaVersionForEventName,
} from "@/modules/reader-world/events/names";
import {
  nextEventMetadata,
  type HybridLogicalClock,
} from "@/modules/reader-world/events/clock";
import { payloadHashBrowser } from "@/infrastructure/event-store/indexeddb/browser-hash";

export type CreateDraftBrowserInput<N extends DomainEventName> = {
  message_name: N;
  experience_id: string;
  correlation_id: string;
  causation_id?: string | null;
  producer: Producer;
  security: SecurityContext;
  payload: DomainEventPayloadByName[N];
  message_id: string;
  recorded_at: string;
  schema_version?: number;
  hlc?: HybridLogicalClock;
  device_id?: string;
};

export async function createDomainEventDraftBrowser<N extends DomainEventName>(
  input: CreateDraftBrowserInput<N>,
): Promise<DomainEventDraftBase<N>> {
  const hash = await payloadHashBrowser(input.payload);
  const metadata = input.hlc
    ? {
        hlc: input.hlc,
        device_id: input.device_id ?? "local-device",
      }
    : nextEventMetadata(input.recorded_at, input.device_id);
  return {
    protocol_version: PROTOCOL_VERSION,
    message_id: input.message_id,
    message_type: "domain_event",
    message_name: input.message_name,
    schema_version:
      input.schema_version ?? schemaVersionForEventName(input.message_name),
    experience_id: input.experience_id,
    correlation_id: input.correlation_id,
    causation_id: input.causation_id ?? null,
    recorded_at: input.recorded_at,
    hlc: metadata.hlc,
    device_id: metadata.device_id,
    producer: input.producer,
    security: input.security,
    payload_hash: hash,
    payload: input.payload,
  };
}
