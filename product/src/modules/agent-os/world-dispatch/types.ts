import type { EventStore } from "@/modules/reader-world/event-store";
import type {
  DomainEventDraft,
  Producer,
  SecurityContext,
} from "@/modules/reader-world/events/envelope";
import type {
  WorldCommand,
  WorldDecisionReceipt,
  WorldState,
} from "@/modules/world";

export type WorldDispatchCode =
  | WorldDecisionReceipt["code"]
  | "STALE"
  | "UNSUPPORTED"
  | "TEMPORARY_FAILURE"
  | "COMMIT_FAILED";

export type WorldEventDraftFactoryInput = {
  message_name: "reader_world.world.event_recorded.v1";
  experience_id: string;
  correlation_id: string;
  causation_id: null;
  producer: Producer;
  security: SecurityContext;
  message_id: string;
  payload: {
    world_id: string;
    world_revision: number;
    event_kind: string;
    actor_id: string | null;
    summary: string;
    metrics: Record<string, number>;
  };
};

/** Browser-safe async factory; it owns payload hashing and envelope timestamping. */
export type WorldDispatchDraftFactory = (
  input: WorldEventDraftFactoryInput,
) => Promise<DomainEventDraft>;

export type WorldDispatchReceipt = {
  ok: boolean;
  committed: boolean;
  duplicate: boolean;
  code: WorldDispatchCode;
  world_revision: number | null;
  event_count: number;
  committed_version: number | null;
  message_ids: string[];
};

export type DispatchWorldActionInput = {
  store: EventStore;
  principal_id: string;
  draft_factory: WorldDispatchDraftFactory;
  turn_id: string;
  command: WorldCommand;
  idempotency_key: string;
};

export type WorldDispatchPortConfig = Pick<
  DispatchWorldActionInput,
  "store" | "principal_id" | "draft_factory"
>;

/** Shape intentionally mirrors the explicit AgentTurn dispatch request. */
export type WorldDispatchPort = (request: {
  turn_id: string;
  command: WorldCommand;
  idempotency_key: string;
}) => Promise<WorldDispatchReceipt>;

export type InspectCurrentWorldInput = {
  store: EventStore;
  experience_id: string;
};

/** Read-only, fail-closed basis for an AgentTurn provider. */
export type CurrentWorldInspection =
  | {
      ok: true;
      world_state: WorldState;
      /** EventStore version, deliberately distinct from world_revision. */
      last_stream_version: number;
    }
  | {
      ok: false;
      code: WorldDispatchCode;
    };
