"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { getBrowserEventStore } from "@/infrastructure/reader-thinking/browser-store";
import {
  LIVE_EXPERIENCE_ID,
  LIVE_PRINCIPAL_ID,
} from "@/modules/reader-thinking/constants";
import { createDomainEventDraftBrowser } from "@/modules/reader-thinking/draft";
import {
  loadChapterMemorySnapshot,
  recordReadPosition,
  retireMemory,
  type ChapterMemorySnapshot,
  type MemoryEventDraftInput,
  type MemoryRuntimePorts,
} from "@/modules/reader-world/memory";
import {
  nextMessageId,
  nowRfc3339,
} from "@/modules/reader-world/events/clock";
import type { DomainEventDraft } from "@/modules/reader-world/events/envelope";

export type ChapterMemoryClientState = Readonly<{
  status: "loading" | "ready" | "error";
  snapshot: ChapterMemorySnapshot | null;
  error: string | null;
}>;

export type ChapterMemoryClient = ChapterMemoryClientState &
  Readonly<{
    record_read_position: (sourceId: string) => Promise<void>;
    retire_memory: (memoryId: string) => Promise<void>;
  }>;

const BROWSER_MEMORY_PORTS: MemoryRuntimePorts = {
  next_id: nextMessageId,
  now: nowRfc3339,
  create_event_draft: async (
    input: MemoryEventDraftInput,
  ): Promise<DomainEventDraft> =>
    (await createDomainEventDraftBrowser(input)) as DomainEventDraft,
};

/** Browser binding for the shared local EventStore. It never keeps a second fact source. */
export function useChapterMemoryClient(input: Readonly<{
  chapter_id: string;
  source_ids: readonly string[];
  enabled?: boolean;
}>): ChapterMemoryClient {
  const enabled = input.enabled !== false;
  const requestKey = `${input.chapter_id}\u001f${input.source_ids.join("\u001f")}`;
  const [state, setState] = useState<
    ChapterMemoryClientState & Readonly<{ request_key: string }>
  >(() => ({
    request_key: requestKey,
    status: enabled ? "loading" : "ready",
    snapshot: null,
    error: null,
  }));
  const mountedRef = useRef(true);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const suppressedReadPositionRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const store = await getBrowserEventStore();
        const loaded = await loadChapterMemorySnapshot({
          store,
          experience_id: LIVE_EXPERIENCE_ID,
          current_chapter_id: input.chapter_id,
          source_ids: input.source_ids,
        });
        if (cancelled) return;
        if (!loaded.ok) {
          setState({
            request_key: requestKey,
            status: "error",
            snapshot: null,
            error: "无法读取本机记忆。",
          });
          return;
        }
        setState({
          request_key: requestKey,
          status: "ready",
          snapshot: loaded.value,
          error: null,
        });
      } catch {
        if (!cancelled) {
          setState({
            request_key: requestKey,
            status: "error",
            snapshot: null,
            error: "无法读取本机记忆。",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, input.chapter_id, input.source_ids, requestKey]);

  const enqueueWrite = useCallback((operation: () => Promise<void>) => {
    const queued = writeQueueRef.current.then(operation, operation);
    writeQueueRef.current = queued.catch(() => undefined);
    return queued;
  }, []);

  const recordPosition = useCallback(
    (sourceId: string): Promise<void> => {
      if (suppressedReadPositionRef.current === sourceId) {
        return Promise.resolve();
      }
      suppressedReadPositionRef.current = null;
      return enqueueWrite(async () => {
        try {
          const store = await getBrowserEventStore();
          const recorded = await recordReadPosition({
            store,
            experience_id: LIVE_EXPERIENCE_ID,
            principal_id: LIVE_PRINCIPAL_ID,
            current_chapter_id: input.chapter_id,
            source_ids: input.source_ids,
            source_id: sourceId,
            ports: BROWSER_MEMORY_PORTS,
          });
          if (!recorded.ok) throw recorded.error;
          if (mountedRef.current) {
            setState({
              request_key: requestKey,
              status: "ready",
              snapshot: recorded.value,
              error: null,
            });
          }
        } catch (error) {
          if (mountedRef.current) {
            setState((current) => ({
              ...current,
              request_key: requestKey,
              status: "error",
              error: "无法保存当前阅读位置。",
            }));
          }
          throw error;
        }
      });
    },
    [enqueueWrite, input.chapter_id, input.source_ids, requestKey],
  );

  const retire = useCallback(
    (memoryId: string): Promise<void> => {
      const retiredPosition = state.snapshot?.projection.memories.find(
        (memory) =>
          memory.memory_id === memoryId && memory.kind === "read_position",
      )?.source_locator;
      if (retiredPosition) {
        suppressedReadPositionRef.current = retiredPosition;
      }
      return enqueueWrite(async () => {
        try {
          const store = await getBrowserEventStore();
          const retired = await retireMemory({
            store,
            experience_id: LIVE_EXPERIENCE_ID,
            principal_id: LIVE_PRINCIPAL_ID,
            current_chapter_id: input.chapter_id,
            source_ids: input.source_ids,
            memory_id: memoryId,
            ports: BROWSER_MEMORY_PORTS,
          });
          if (!retired.ok) throw retired.error;
          if (mountedRef.current) {
            setState({
              request_key: requestKey,
              status: "ready",
              snapshot: retired.value,
              error: null,
            });
          }
        } catch (error) {
          if (suppressedReadPositionRef.current === retiredPosition) {
            suppressedReadPositionRef.current = null;
          }
          if (mountedRef.current) {
            setState((current) => ({
              ...current,
              request_key: requestKey,
              status: "error",
              error: "无法删除这条记忆，原记录仍保留。",
            }));
          }
          throw error;
        }
      });
    },
    [enqueueWrite, input.chapter_id, input.source_ids, requestKey, state.snapshot],
  );

  const visibleState: ChapterMemoryClientState = !enabled
    ? { status: "ready", snapshot: null, error: null }
    : state.request_key === requestKey
      ? state
      : { status: "loading", snapshot: null, error: null };
  return {
    ...visibleState,
    record_read_position: recordPosition,
    retire_memory: retire,
  };
}
