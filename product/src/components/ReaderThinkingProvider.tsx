"use client";

/**
 * T005/T006 ReaderThinking: EventStore-backed Ideas + Relation + BookThought.
 * React holds only projection snapshots + transient companion candidate.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  acceptAndCommitRelation,
  createDeterministicCompanionFixture,
  emptyBoundarySession,
  proposeCanonicalRelation,
  reduceBoundary,
  rejectRelation,
  reviseRelation,
  tryCanonicalConstrainedBy,
  validateCompanionCandidate,
  type BookThoughtCandidate,
  type BoundarySession,
  type SourceDiscussionSnapshot,
} from "@/modules/agent-os";
import {
  LIVE_EXPERIENCE_ID,
  acceptBookThought,
  createBrowserClockPort,
  createBrowserIdPort,
  createMapSourceDiscussionResolver,
  reloadGraph,
  reviseBookThought,
  reviseIdea,
  snapshotsMatch,
  submitIdea,
  type SourceEvidenceMap,
  type SourceEvidenceSnapshot,
  type ThinkingError,
} from "@/modules/reader-thinking";
import type { ReadingGraphView } from "@/modules/reader-world/projections/types";
import { emptyReadingGraphView } from "@/modules/reader-world/projections/types";
import { getBrowserEventStore } from "@/infrastructure/reader-thinking/browser-store";
import { useReaderSession } from "./ReaderSessionProvider";

type UiStatus = {
  kind: "idle" | "busy" | "error" | "info";
  message: string;
  code?: string;
};

export type DiscussionSnapshotMap = Record<string, SourceDiscussionSnapshot>;

type ThinkingApi = {
  ready: boolean;
  graph: ReadingGraphView;
  status: UiStatus;
  activeIdeas: ReadingGraphView["ideas"];
  ideaHistory: ReadingGraphView["ideas"];
  activeThoughts: ReadingGraphView["thoughts"];
  thoughtHistory: ReadingGraphView["thoughts"];
  currentRelation: ReadingGraphView["relations"][number] | null;
  canPropose: boolean;
  candidate: BookThoughtCandidate | null;
  /** Live T002 evidence map (sourceId → sealed snapshot). */
  sourceEvidence: SourceEvidenceMap;
  getSourceEvidence: (sourceId: string) => SourceEvidenceSnapshot | null;
  submitIdea: (sourceId: string, text: string) => Promise<void>;
  reviseIdea: (ideaId: string, text: string) => Promise<void>;
  replayMarketFixture: () => Promise<void>;
  askSourceDiscussion: (sourceId: string, questionZh: string) => Promise<void>;
  /**
   * T007: classify → boundary effects (soft-return / stop / continue / decline)
   * or forward source_question to T006. Clears raw input at call site.
   */
  submitBoundaryInput: (
    sourceId: string,
    text: string,
  ) => Promise<void>;
  declineSoftReturn: () => void;
  dismissSoftReturn: () => void;
  rejectBookThoughtCandidate: () => void;
  acceptBookThoughtCandidate: (inferenceOverride?: string) => Promise<void>;
  reviseBookThought: (thoughtId: string, inferenceZh: string) => Promise<void>;
  proposeRelation: () => Promise<void>;
  rejectRelation: () => Promise<void>;
  reviseRelation: (corrections: string) => Promise<void>;
  reproposeRelation: () => Promise<void>;
  acceptRelation: () => Promise<void>;
  reload: () => Promise<void>;
  /** T007 control-only state (not EventStore). */
  boundary: BoundarySession;
  sessionState: string;
};

const ThinkingContext = createContext<ThinkingApi | null>(null);

const MARKET_FIXTURE_TEXT =
  "市场范围限制了分工的精细程度。";
const MARKET_FIXTURE_IDEA_ID = "idea_market_fixture";
const MARKET_FIXTURE_IDEMPOTENCY = "idem_market_replay_fixture_v1";

const companionFixture = createDeterministicCompanionFixture();

export function ReaderThinkingProvider({
  children,
  sourceEvidence,
  discussionSnapshots,
}: {
  children: ReactNode;
  /** Built on server from loadWealthOfNationsBook SourceBlocks (F33). */
  sourceEvidence: SourceEvidenceMap;
  /** Live SourceBlock quote + evidence for T006 discussion. */
  discussionSnapshots: DiscussionSnapshotMap;
}) {
  const session = useReaderSession();
  const [ready, setReady] = useState(false);
  const [graph, setGraph] = useState<ReadingGraphView>(() =>
    emptyReadingGraphView(LIVE_EXPERIENCE_ID),
  );
  const [candidate, setCandidate] = useState<BookThoughtCandidate | null>(null);
  const [boundary, setBoundary] = useState<BoundarySession>(() =>
    emptyBoundarySession(),
  );
  const [status, setStatus] = useState<UiStatus>({
    kind: "idle",
    message: "",
  });
  const portsRef = useRef<{
    store: Awaited<ReturnType<typeof getBrowserEventStore>>;
    ids: ReturnType<typeof createBrowserIdPort>;
    clock: ReturnType<typeof createBrowserClockPort>;
  } | null>(null);
  /** Revision-keyed reconcile — prevents accept hot-loop / IDB thrash (F30). */
  const reconcileKeyRef = useRef<string>("");
  const actionSeqRef = useRef(0);

  const showError = useCallback((err: ThinkingError) => {
    setStatus({
      kind: "error",
      message: err.message,
      code: err.code,
    });
  }, []);

  const nextIdempotency = useCallback((prefix: string) => {
    actionSeqRef.current += 1;
    return `${prefix}_${actionSeqRef.current}`;
  }, []);

  const reconcileSession = useCallback(
    (g: ReadingGraphView) => {
      // Fail-closed: accepted graph becomes stale → invalidate once per key
      if (g.graph_stale && g.accepted_relation_ids.length > 0) {
        const staleKey = `stale:${g.idea_basis_revision}:${g.accepted_relation_ids.join(",")}`;
        if (reconcileKeyRef.current === staleKey) return;
        if (
          session.context.graph_committed ||
          session.state !== "active.reading" ||
          session.context.relation_reviewed
        ) {
          const r = session.send({ type: "GRAPH_BASIS_INVALIDATED" });
          if (!r.accepted && r.reason_code !== "INVALID_TRANSITION") {
            // still mark key to avoid spin
          }
        }
        reconcileKeyRef.current = staleKey;
        setStatus({
          kind: "info",
          message: "Idea 已修订，先前确认的关系失效，世界保持关闭。请重新审阅。",
        });
        return;
      }

      const accepted = g.relations.find(
        (r) =>
          r.review_status === "accepted" &&
          !r.stale &&
          g.accepted_relation_ids.includes(r.relation_id),
      );
      if (!(accepted && g.graph_revision > 0 && !g.graph_stale)) return;

      // Real reading basis (idea_basis_revision) + graph_revision — not forged graph_rev-1.
      const key = `commit:${g.graph_revision}:${accepted.relation_id}:basis${accepted.basis_revision}`;
      if (reconcileKeyRef.current === key) return;

      // Already in session at this graph revision → skip (idempotent).
      if (
        session.context.graph_committed &&
        session.context.graph_revision === g.graph_revision &&
        session.context.relation_id === accepted.relation_id
      ) {
        reconcileKeyRef.current = key;
        return;
      }

      if (session.state === "active.reading" || session.state === "active.reviewing_graph") {
        if (session.state === "active.reading") {
          session.send({ type: "ENTER_REVIEWING_GRAPH" });
        }
        const reviewed = session.send({
          type: "RELATION_REVIEWED",
          relation_id: accepted.relation_id,
          basis_revision: accepted.basis_revision,
        });
        if (!reviewed.accepted) {
          setStatus({
            kind: "error",
            message: `Session RELATION_REVIEWED 拒绝: ${reviewed.reason_code}`,
            code: reviewed.reason_code,
          });
          return;
        }
        const committed = session.send({
          type: "GRAPH_COMMITTED",
          graph_revision: g.graph_revision,
          accepted_relation_ids: [...g.accepted_relation_ids],
        });
        if (!committed.accepted) {
          setStatus({
            kind: "error",
            message: `Session GRAPH_COMMITTED 拒绝: ${committed.reason_code}`,
            code: committed.reason_code,
          });
          return;
        }
      }
      reconcileKeyRef.current = key;
    },
    [session],
  );

  const applyGraph = useCallback(
    (g: ReadingGraphView) => {
      setGraph(g);
      reconcileSession(g);
    },
    [reconcileSession],
  );

  const reload = useCallback(async () => {
    const ports = portsRef.current;
    if (!ports) return;
    const r = await reloadGraph(ports);
    if (!r.ok) {
      showError(r.error);
      return;
    }
    applyGraph(r.value);
  }, [applyGraph, showError]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await getBrowserEventStore();
        if (cancelled) return;
        portsRef.current = {
          store,
          ids: createBrowserIdPort(),
          clock: createBrowserClockPort(),
        };
        setReady(true);
        const r = await reloadGraph(portsRef.current);
        if (!r.ok) {
          showError(r.error);
          return;
        }
        applyGraph(r.value);
      } catch (e) {
        setStatus({
          kind: "error",
          message: e instanceof Error ? e.message : "IndexedDB 初始化失败",
          code: "STORE_ERROR",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyGraph, showError]);

  const withBusy = useCallback(
    async (fn: () => Promise<void>) => {
      setStatus({ kind: "busy", message: "处理中…" });
      try {
        await fn();
        // If handler left status as busy, clear so buttons re-enable (F30/P1).
        setStatus((s) =>
          s.kind === "busy" ? { kind: "idle", message: "" } : s,
        );
      } catch (e) {
        setStatus({
          kind: "error",
          message: e instanceof Error ? e.message : "操作失败",
        });
      }
    },
    [],
  );

  const resolveEvidence = useCallback(
    (sourceId: string): SourceEvidenceSnapshot | null =>
      sourceEvidence[sourceId] ?? null,
    [sourceEvidence],
  );

  const api = useMemo<ThinkingApi>(() => {
    const ports = () => {
      if (!portsRef.current) throw new Error("store not ready");
      return portsRef.current;
    };

    const discussionResolver = createMapSourceDiscussionResolver(
      discussionSnapshots,
    );

    const bookThoughtPorts = () => {
      if (!portsRef.current) throw new Error("store not ready");
      return {
        ...portsRef.current,
        resolver: discussionResolver,
      };
    };

    return {
      ready,
      graph,
      status,
      boundary,
      sessionState: session.state,
      activeIdeas: graph.ideas.filter((i) => i.status === "active"),
      ideaHistory: graph.ideas,
      activeThoughts: graph.thoughts.filter((t) => t.status === "active"),
      thoughtHistory: graph.thoughts,
      currentRelation:
        graph.relations
          .slice()
          .sort((a, b) => b.proposal_revision - a.proposal_revision)[0] ?? null,
      canPropose: tryCanonicalConstrainedBy(graph) != null,
      candidate: (() => {
        if (!candidate) return null;
        // F38: full canonical snapshotsMatch against sealed map.
        const live = discussionResolver.get(
          candidate.source_snapshot.source_id,
        );
        if (!live || !snapshotsMatch(candidate.source_snapshot, live)) {
          return { ...candidate, stale: true };
        }
        return candidate;
      })(),
      sourceEvidence,
      getSourceEvidence: resolveEvidence,
      reload,
      askSourceDiscussion: async (sourceId, questionZh) => {
        await withBusy(async () => {
          const snap = discussionResolver.get(sourceId);
          if (!snap) {
            showError({
              code: "SOURCE_UNAVAILABLE",
              message: `无讨论快照: ${sourceId}`,
            });
            return;
          }
          // Capture stream version before ask — must not change.
          const before = await reloadGraph(ports());
          const versionBefore =
            before.ok
              ? before.value.last_stream_version
              : graph.last_stream_version;

          const raw = await companionFixture.discuss({
            question_zh: questionZh,
            source: snap,
          });
          const guarded = validateCompanionCandidate(snap, raw);
          if (!guarded.ok) {
            setCandidate(null);
            setStatus({
              kind: "error",
              message: `来源不可核验：${guarded.message}`,
              code: guarded.code,
            });
            return;
          }

          // Zero-mutation check (ask must not append).
          const after = await reloadGraph(ports());
          if (
            after.ok &&
            after.value.last_stream_version !== versionBefore
          ) {
            setStatus({
              kind: "error",
              message: "提问阶段意外写入 EventStore",
              code: "INVALID_STATE",
            });
            return;
          }

          setCandidate({
            ...guarded.candidate,
            candidate_id: `cand_${Date.now()}`,
            source_snapshot: snap,
            stale: false,
          });
          setStatus({
            kind: "info",
            message: "已生成陪读回答与 Agent 思考候选（尚未保存）。",
          });
        });
      },
      submitBoundaryInput: async (sourceId, text) => {
        await withBusy(async () => {
          // Classify + reduce before any mutation; raw text not stored in boundary.
          const result = reduceBoundary(boundary, {
            type: "SUBMIT",
            text,
            active_source_id: sourceId,
          });
          setBoundary(result.session);

          if (result.effect.type === "SESSION_STOP") {
            const receipt = session.send({ type: "STOP" });
            if (!receipt.accepted) {
              setStatus({
                kind: "error",
                message: `停止未生效: ${receipt.reason_code}`,
                code: receipt.reason_code,
              });
              return;
            }
            setCandidate(null);
            setStatus({
              kind: "info",
              message: "已停止（session paused）。",
            });
            return;
          }

          if (result.effect.type === "SESSION_RESUME") {
            if (session.state === "paused") {
              const receipt = session.send({ type: "RESUME" });
              if (!receipt.accepted) {
                setStatus({
                  kind: "error",
                  message: `继续未生效: ${receipt.reason_code}`,
                  code: receipt.reason_code,
                });
                return;
              }
            }
            setStatus({
              kind: "info",
              message: "已继续；回引提醒已恢复。",
            });
            return;
          }

          if (result.effect.type === "SOURCE_QUESTION") {
            const sid = result.effect.source_id ?? sourceId;
            // Forward to existing T006 path (zero EventStore on ask).
            const snap = discussionResolver.get(sid);
            if (!snap) {
              showError({
                code: "SOURCE_UNAVAILABLE",
                message: `无讨论快照: ${sid}`,
              });
              return;
            }
            const before = await reloadGraph(ports());
            const versionBefore = before.ok
              ? before.value.last_stream_version
              : graph.last_stream_version;
            const raw = await companionFixture.discuss({
              question_zh: result.effect.text,
              source: snap,
            });
            const guarded = validateCompanionCandidate(snap, raw);
            if (!guarded.ok) {
              setCandidate(null);
              setStatus({
                kind: "error",
                message: `来源不可核验：${guarded.message}`,
                code: guarded.code,
              });
              return;
            }
            const after = await reloadGraph(ports());
            if (
              after.ok &&
              after.value.last_stream_version !== versionBefore
            ) {
              setStatus({
                kind: "error",
                message: "提问阶段意外写入 EventStore",
                code: "INVALID_STATE",
              });
              return;
            }
            setCandidate({
              ...guarded.candidate,
              candidate_id: `cand_${Date.now()}`,
              source_snapshot: snap,
              stale: false,
            });
            setStatus({
              kind: "info",
              message: "已生成陪读回答与 Agent 思考候选（尚未保存）。",
            });
            return;
          }

          // off_topic / unknown / decline: zero EventStore side effects
          if (result.session.soft_return) {
            setCandidate(null);
            setStatus({
              kind: "info",
              message: "跑题：已温和回引一次。",
            });
            return;
          }
          if (result.session.clarification) {
            setCandidate(null);
            setStatus({
              kind: "info",
              message: result.session.clarification,
            });
            return;
          }
          if (result.session.status_hint) {
            setCandidate(null);
            setStatus({
              kind: "info",
              message: result.session.status_hint,
            });
            return;
          }
          setStatus({ kind: "idle", message: "" });
        });
      },
      declineSoftReturn: () => {
        const result = reduceBoundary(boundary, {
          type: "SUBMIT",
          text: "不用了",
          active_source_id: null,
        });
        setBoundary(result.session);
        setCandidate(null);
        setStatus({
          kind: "info",
          message: result.session.status_hint ?? "已关闭回引。",
        });
      },
      dismissSoftReturn: () => {
        const result = reduceBoundary(boundary, { type: "DISMISS_SOFT_RETURN" });
        setBoundary(result.session);
      },
      rejectBookThoughtCandidate: () => {
        setCandidate(null);
        setStatus({ kind: "info", message: "已丢弃候选（零事件写入）。" });
      },
      acceptBookThoughtCandidate: async (inferenceOverride) => {
        await withBusy(async () => {
          if (!candidate || candidate.stale) {
            showError({
              code: "STALE_CANDIDATE",
              message: "没有可保存的候选",
            });
            return;
          }
          const sourceId = candidate.source_ids[0];
          if (!sourceId || !discussionResolver.get(sourceId)) {
            showError({
              code: "SOURCE_UNAVAILABLE",
              message: "当前来源不可用",
            });
            return;
          }
          const toAccept: BookThoughtCandidate = {
            ...candidate,
            inference_zh: (inferenceOverride ?? candidate.inference_zh).trim(),
          };
          const r = await acceptBookThought(bookThoughtPorts(), {
            candidate: toAccept,
            source_id: sourceId,
            idempotency_key: nextIdempotency(
              `accept_thought_${candidate.candidate_id}`,
            ),
          });
          if (!r.ok) {
            showError(r.error);
            return;
          }
          applyGraph(r.value.graph);
          setCandidate(null);
          setStatus({
            kind: "info",
            message: r.value.duplicate
              ? "Agent 思考已存在（幂等）。"
              : "已保存为 Agent 思考。",
          });
        });
      },
      reviseBookThought: async (thoughtId, inferenceZh) => {
        await withBusy(async () => {
          const active = graph.thoughts.find(
            (t) => t.thought_id === thoughtId && t.status === "active",
          );
          const r = await reviseBookThought(bookThoughtPorts(), {
            thought_id: thoughtId,
            inference_zh: inferenceZh,
            confidence: active?.confidence ?? 0.8,
            open_question: active?.open_question ?? null,
            thought_kind: active?.thought_kind,
            idempotency_key: nextIdempotency(`revise_thought_${thoughtId}`),
          });
          if (!r.ok) {
            showError(r.error);
            return;
          }
          applyGraph(r.value.graph);
          setStatus({ kind: "info", message: "Agent 思考已修订。" });
        });
      },
      submitIdea: async (sourceId, text) => {
        await withBusy(async () => {
          const snap = resolveEvidence(sourceId);
          if (!snap) {
            showError({
              code: "INVALID_SOURCE",
              message: `无 SourceBlock 证据: ${sourceId}`,
            });
            return;
          }
          const r = await submitIdea(ports(), {
            text,
            source: snap,
            idempotency_key: nextIdempotency(`submit_${sourceId}`),
          });
          if (!r.ok) {
            showError(r.error);
            return;
          }
          applyGraph(r.value.graph);
          if (tryCanonicalConstrainedBy(r.value.graph)) {
            const p = await proposeCanonicalRelation(ports(), {
              idempotency_key: nextIdempotency("auto_propose"),
            });
            if (p.ok) {
              applyGraph(p.value.graph);
              session.send({ type: "ENTER_REVIEWING_GRAPH" });
              setStatus({
                kind: "info",
                message: "已提出关系提议，请审阅。",
              });
              return;
            }
          }
          setStatus({ kind: "info", message: "Idea 已保存。" });
        });
      },
      reviseIdea: async (ideaId, text) => {
        await withBusy(async () => {
          const r = await reviseIdea(ports(), {
            idea_id: ideaId,
            text,
            idempotency_key: nextIdempotency(`revise_${ideaId}`),
          });
          if (!r.ok) {
            showError(r.error);
            return;
          }
          applyGraph(r.value.graph);
        });
      },
      replayMarketFixture: async () => {
        await withBusy(async () => {
          const snap = resolveEvidence("smith.b1.c3.market_extent");
          if (!snap) {
            showError({
              code: "INVALID_SOURCE",
              message: "市场段 SourceBlock 证据不可用",
            });
            return;
          }
          const r = await submitIdea(ports(), {
            text: MARKET_FIXTURE_TEXT,
            source: snap,
            idea_id: MARKET_FIXTURE_IDEA_ID,
            idempotency_key: MARKET_FIXTURE_IDEMPOTENCY,
          });
          if (!r.ok) {
            if (r.error.code === "IDEMPOTENCY_KEY_REUSED") {
              await reload();
              setStatus({
                kind: "info",
                message: "演示输入已存在（幂等）。",
              });
              return;
            }
            showError(r.error);
            return;
          }
          applyGraph(r.value.graph);
          if (tryCanonicalConstrainedBy(r.value.graph)) {
            const p = await proposeCanonicalRelation(ports(), {
              idempotency_key: nextIdempotency("auto_propose_fixture"),
            });
            if (p.ok) {
              applyGraph(p.value.graph);
              session.send({ type: "ENTER_REVIEWING_GRAPH" });
            }
          }
          setStatus({
            kind: "info",
            message: "演示输入，非语音 — 市场段 Idea 已写入。",
          });
        });
      },
      proposeRelation: async () => {
        await withBusy(async () => {
          const r = await proposeCanonicalRelation(ports(), {
            idempotency_key: nextIdempotency("propose"),
          });
          if (!r.ok) {
            showError(r.error);
            return;
          }
          applyGraph(r.value.graph);
          session.send({ type: "ENTER_REVIEWING_GRAPH" });
          setStatus({ kind: "info", message: "关系提议已生成。" });
        });
      },
      rejectRelation: async () => {
        await withBusy(async () => {
          const rel = graph.relations.find((r) => r.review_status === "proposed");
          if (!rel) {
            setStatus({ kind: "error", message: "没有可拒绝的提议" });
            return;
          }
          const r = await rejectRelation(ports(), {
            relation_id: rel.relation_id,
            idempotency_key: nextIdempotency(`reject_${rel.relation_id}`),
          });
          if (!r.ok) {
            showError(r.error);
            return;
          }
          applyGraph(r.value.graph);
          setStatus({
            kind: "info",
            message: "已拒绝。不会自动重提，世界保持关闭。",
          });
        });
      },
      reviseRelation: async (corrections) => {
        await withBusy(async () => {
          const rel =
            graph.relations.find((r) => r.review_status === "proposed") ??
            graph.relations[0];
          if (!rel) {
            setStatus({ kind: "error", message: "没有可修改的关系" });
            return;
          }
          const r = await reviseRelation(ports(), {
            relation_id: rel.relation_id,
            corrections,
            idempotency_key: nextIdempotency(`revise_rel_${rel.relation_id}`),
          });
          if (!r.ok) {
            showError(r.error);
            return;
          }
          applyGraph(r.value.graph);
          setStatus({ kind: "info", message: "已修订并生成新提议。" });
        });
      },
      reproposeRelation: async () => {
        await withBusy(async () => {
          const r = await proposeCanonicalRelation(ports(), {
            idempotency_key: nextIdempotency("repropose"),
          });
          if (!r.ok) {
            showError(r.error);
            return;
          }
          applyGraph(r.value.graph);
          session.send({ type: "ENTER_REVIEWING_GRAPH" });
          setStatus({ kind: "info", message: "已手动重新提议。" });
        });
      },
      acceptRelation: async () => {
        await withBusy(async () => {
          const rel = graph.relations.find(
            (r) => r.review_status === "proposed" && !r.stale,
          );
          if (!rel) {
            setStatus({ kind: "error", message: "没有可确认的提议" });
            return;
          }
          const r = await acceptAndCommitRelation(ports(), {
            relation_id: rel.relation_id,
            idempotency_key: nextIdempotency(`accept_${rel.relation_id}`),
          });
          if (!r.ok) {
            showError(r.error);
            return;
          }
          applyGraph(r.value.graph);
          setStatus({
            kind: "info",
            message: "关系已确认并写入 GraphCommitted（世界仍关闭，T005 不开放）。",
          });
        });
      },
    };
  }, [
    ready,
    graph,
    status,
    candidate,
    boundary,
    reload,
    withBusy,
    applyGraph,
    showError,
    session,
    nextIdempotency,
    sourceEvidence,
    resolveEvidence,
    discussionSnapshots,
  ]);


  return (
    <ThinkingContext.Provider value={api}>{children}</ThinkingContext.Provider>
  );
}

export function useReaderThinking(): ThinkingApi {
  const ctx = useContext(ThinkingContext);
  if (!ctx) {
    throw new Error("useReaderThinking requires ReaderThinkingProvider");
  }
  return ctx;
}
