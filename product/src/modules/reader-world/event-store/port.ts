import type { DomainEvent, DomainEventDraft } from "../events";
import type { StoreResult } from "./errors";

/**
 * EventStore port — sole fact source for reader world events.
 * Memory and IndexedDB adapters implement this contract.
 */
export type AppendEventsRequest = {
  experience_id: string;
  principal_id: string;
  idempotency_key: string;
  /** -1 means stream must be empty (first commit). */
  expected_version: number;
  events: DomainEventDraft[];
};

export type AppendReceipt = {
  experience_id: string;
  previous_version: number;
  committed_version: number;
  message_ids: string[];
  payload_hashes: string[];
  duplicate: boolean;
};

export type IdempotencyReceipt = {
  principal_id: string;
  experience_id: string;
  idempotency_key: string;
  payload_hash: string;
  previous_version: number;
  committed_version: number;
  message_ids: string[];
  payload_hashes: string[];
  first_recorded_at: string;
};

export interface EventStore {
  append(request: AppendEventsRequest): Promise<StoreResult<AppendReceipt>>;

  load(
    experience_id: string,
    options?: { after_version?: number },
  ): Promise<StoreResult<DomainEvent[]>>;

  getVersion(experience_id: string): Promise<StoreResult<number>>;

  getIdempotencyReceipt(
    principal_id: string,
    experience_id: string,
    idempotency_key: string,
  ): Promise<StoreResult<IdempotencyReceipt | null>>;
}
