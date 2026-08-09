/**
 * Browser EventStore singleton for ReaderThinking (IndexedDB).
 */
import { IndexedDbEventStore } from "@/infrastructure/event-store/indexeddb";
import type { EventStore } from "@/modules/reader-world/event-store";

let store: IndexedDbEventStore | null = null;
let openPromise: Promise<EventStore> | null = null;

export async function getBrowserEventStore(): Promise<EventStore> {
  if (store) return store;
  if (!openPromise) {
    openPromise = (async () => {
      const s = new IndexedDbEventStore();
      await s.open();
      store = s;
      return s;
    })();
  }
  return openPromise;
}
