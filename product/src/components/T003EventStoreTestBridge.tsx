"use client";

/**
 * Test-only bridge for Playwright e2e (T003 IndexedDB EventStore).
 * Mounted only when NEXT_PUBLIC_T003_BRIDGE === "1" at build time.
 * Production builds without that env never include a live window hook.
 *
 * All methods return plain JSON-serializable results so Playwright
 * page.evaluate does not lose EventStoreError fields.
 */

import { useEffect } from "react";
import {
  IndexedDbEventStore,
  READER_WORLD_IDB_NAME,
} from "@/infrastructure/event-store/indexeddb";
import type {
  AppendEventsRequest,
  AppendReceipt,
  IdempotencyReceipt,
} from "@/modules/reader-world/event-store/port";
import type { StoreResult } from "@/modules/reader-world/event-store/errors";
import type { DomainEvent, DomainEventDraft } from "@/modules/reader-world/events/envelope";

/** Plain JSON shape safe to cross the Playwright bridge. */
export type BridgeError = {
  code: string;
  message: string;
  current_version?: number;
  details?: Record<string, unknown>;
};

export type BridgeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: BridgeError };

function serializeResult<T>(result: StoreResult<T>): BridgeResult<T> {
  if (result.ok) {
    return { ok: true, value: result.value };
  }
  const err = result.error;
  const plain: BridgeError = {
    code: err.code,
    message: err.message,
  };
  if (typeof err.current_version === "number") {
    plain.current_version = err.current_version;
  }
  if (err.details && typeof err.details === "object") {
    plain.details = { ...err.details };
  }
  return { ok: false, error: plain };
}

export type T003BridgeApi = {
  dbName: string;
  ready: boolean;
  openStore: () => Promise<void>;
  closeStore: () => void;
  deleteDatabase: () => Promise<void>;
  append: (
    request: AppendEventsRequest,
  ) => Promise<BridgeResult<AppendReceipt>>;
  load: (
    experience_id: string,
    options?: { after_version?: number },
  ) => Promise<BridgeResult<DomainEvent[]>>;
  getVersion: (experience_id: string) => Promise<BridgeResult<number>>;
  getIdempotencyReceipt: (
    principal_id: string,
    experience_id: string,
    idempotency_key: string,
  ) => Promise<BridgeResult<IdempotencyReceipt | null>>;
  rebuildFromEvents: (experience_id: string) => Promise<BridgeResult<unknown>>;
  loadProjections: (experience_id: string) => Promise<BridgeResult<unknown>>;
  clearProjections: (experience_id?: string) => Promise<BridgeResult<true>>;
  exportDebugTrace: (experience_id: string) => Promise<BridgeResult<string>>;
  /**
   * Test-only fault hook. When true, next append aborts after validation
   * and version check, before any put (zero half-writes).
   */
  setTestAbortBeforePut: (value: boolean) => void;
  /** Append a full scenario (one event per commit) and rebuild projections. */
  runScenario: (input: {
    experience_id: string;
    principal_id: string;
    drafts: DomainEventDraft[];
  }) => Promise<unknown>;
};

type BridgeWindow = Window & { __T003_EVENT_STORE__?: T003BridgeApi };

export function T003EventStoreTestBridge() {
  useEffect(() => {
    // Runtime gate (build also trees the host when env is unset).
    if (process.env.NEXT_PUBLIC_T003_BRIDGE !== "1") {
      return;
    }

    let store = new IndexedDbEventStore();
    const w = window as BridgeWindow;

    const api: T003BridgeApi = {
      dbName: READER_WORLD_IDB_NAME,
      ready: true,
      openStore: async () => {
        await store.open();
      },
      closeStore: () => {
        store.close();
      },
      deleteDatabase: async () => {
        await store.deleteDatabase();
        store = new IndexedDbEventStore();
      },
      append: async (request) => serializeResult(await store.append(request)),
      load: async (experience_id, options) =>
        serializeResult(await store.load(experience_id, options)),
      getVersion: async (experience_id) =>
        serializeResult(await store.getVersion(experience_id)),
      getIdempotencyReceipt: async (principal_id, experience_id, key) =>
        serializeResult(
          await store.getIdempotencyReceipt(principal_id, experience_id, key),
        ),
      rebuildFromEvents: async (experience_id) =>
        serializeResult(await store.rebuildFromEvents(experience_id)),
      loadProjections: async (experience_id) =>
        serializeResult(await store.loadProjections(experience_id)),
      clearProjections: async (experience_id) =>
        serializeResult(await store.clearProjections(experience_id)),
      exportDebugTrace: async (experience_id) =>
        serializeResult(await store.exportDebugTraceJson(experience_id)),
      setTestAbortBeforePut: (value: boolean) => {
        store.__testAbortBeforePut = value;
      },
      runScenario: async ({ experience_id, principal_id, drafts }) => {
        await store.open();
        let expected = -1;
        const receipts: BridgeResult<AppendReceipt>[] = [];
        for (let i = 0; i < drafts.length; i++) {
          const res = serializeResult(
            await store.append({
              experience_id,
              principal_id,
              idempotency_key: `scenario-step-${i}`,
              expected_version: expected,
              events: [drafts[i]],
            }),
          );
          receipts.push(res);
          if (!res.ok) {
            return { ok: false, step: i, result: res, receipts };
          }
          expected = res.value.committed_version;
        }
        const rebuilt = serializeResult(
          await store.rebuildFromEvents(experience_id),
        );
        const version = serializeResult(await store.getVersion(experience_id));
        const loaded = serializeResult(await store.load(experience_id));
        return {
          ok: true,
          receipts,
          rebuilt,
          version,
          loaded,
          event_count: loaded.ok ? loaded.value.length : 0,
        };
      },
    };

    w.__T003_EVENT_STORE__ = api;

    return () => {
      store.close();
      if (w.__T003_EVENT_STORE__ === api) {
        delete w.__T003_EVENT_STORE__;
      }
    };
  }, []);

  return null;
}
