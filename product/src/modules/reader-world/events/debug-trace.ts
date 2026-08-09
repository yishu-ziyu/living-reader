import type { DomainEvent } from "./envelope";
import { isDomainEventName } from "./names";
import { projectPublicPayload } from "./payload-schema";

/**
 * Public debug view of a domain event.
 * Payload is projected through per-event-type public allowlist only.
 * Never includes authentication_context, prompts, credentials, or raw audio.
 */
export type PublicEventTrace = {
  message_id: string;
  message_name: string;
  message_type: "domain_event";
  experience_id: string;
  correlation_id: string;
  causation_id: string | null;
  stream_version: number;
  event_index_in_commit: number;
  payload_hash: string;
  schema_version: number;
  recorded_at: string;
  producer_module: string;
  principal_id: string;
  authority: string;
  integrity: string;
  /** Semantic payload only; allowlisted fields. */
  payload: Record<string, unknown>;
};

function publicPayloadFor(event: DomainEvent): Record<string, unknown> {
  if (!isDomainEventName(event.message_name)) {
    return {};
  }
  return projectPublicPayload(event.message_name, event.payload);
}

export function exportDebugTrace(events: DomainEvent[]): PublicEventTrace[] {
  return events.map((e) => ({
    message_id: e.message_id,
    message_name: e.message_name,
    message_type: "domain_event",
    experience_id: e.experience_id,
    correlation_id: e.correlation_id,
    causation_id: e.causation_id,
    stream_version: e.stream_version,
    event_index_in_commit: e.event_index_in_commit,
    payload_hash: e.payload_hash,
    schema_version: e.schema_version,
    recorded_at: e.recorded_at,
    producer_module: e.producer.module,
    principal_id: e.security.principal_id,
    authority: e.security.authority,
    integrity: e.security.integrity,
    payload: publicPayloadFor(e),
  }));
}

/** Secret value markers and forbidden key aliases (test + safety scan). */
const SECRET_VALUE_MARKERS = [
  "SECRET_PROMPT",
  "SECRET_CREDENTIAL",
  "SECRET_AUDIO",
  "SECRET_AUTH_CTX",
  "SECRET_TOKEN",
  "SECRET_API_KEY",
];

const SECRET_KEY_ALIASES = [
  "authentication_context",
  "user_prompt",
  "provider_credential",
  "rawAudio",
  "raw_audio",
  "system_prompt",
  "api_key",
  "chain_of_thought",
  "\"prompt\"",
  "\"credential\"",
  "\"credentials\"",
  "\"token\"",
  "\"thinking\"",
];

/** Scan a serialized trace for forbidden secret markers (test helper). */
export function debugTraceContainsSecrets(traceJson: string): boolean {
  for (const marker of SECRET_VALUE_MARKERS) {
    if (traceJson.includes(marker)) return true;
  }
  const lowered = traceJson.toLowerCase();
  return SECRET_KEY_ALIASES.some((m) => lowered.includes(m.toLowerCase()));
}
