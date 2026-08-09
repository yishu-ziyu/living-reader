export {
  DOMAIN_SOURCE_IDS,
  type DomainSourceId,
  type SourceBlock,
  type SourceKey,
  type SourceLocator,
  type EvidenceRef,
  type BodyNode,
  type BookArtifact,
} from "./source";

/**
 * World surface states for the inline slot between sources.
 * T001 only ships `closed`. Loading/open arrive with later tasks.
 */
export type WorldSlotState = "closed" | "loading" | "open";

/** T003 reader-world EventStore / events surface (UI may import types only). */
export type {
  DomainEvent,
  DomainEventDraft,
  DomainEventName,
} from "@/modules/reader-world/events";
export type { EventStore, AppendReceipt } from "@/modules/reader-world/event-store";
export type {
  ReadingGraphView,
  WorldProjectionView,
} from "@/modules/reader-world/projections";
