/**
 * Memory adapter entry for shared EventStore conformance suite.
 */
import { InMemoryEventStore } from "@/infrastructure/event-store/memory";
import { runEventStoreConformance } from "./conformance/event-store-conformance";

runEventStoreConformance("InMemoryEventStore", () => new InMemoryEventStore(), {
  supportsConcurrentRace: true,
  // F23 may add uniqueness; Memory currently has no message_id index.
  supportsMessageIdUniqueness: false,
});
