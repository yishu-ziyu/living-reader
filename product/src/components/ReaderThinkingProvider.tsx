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
  classifyIntent,
  createAgentTurnClientProvider,
  createWorldDispatchPort,
  deriveAgentTurnSourceSnapshotId,
  deriveWorldActionIdempotencyKey,
  emptyBoundarySession,
  handleAgentTurn,
  inspectCurrentWorld,
  proposeCanonicalRelation,
  reduceBoundary,
  rejectRelation,
  reviseRelation,
  tryCanonicalConstrainedBy,
  type AgentWorldInvitation,
  type AgentTurnActionId,
  type AgentTurnDecision,
  type AgentTurnDispatchPort,
  type AgentTurnDispatchReceipt,
  type AgentTurnVisibleTurn,
  type BookThoughtCandidate,
  type BoundarySession,
  type InvitationBasis,
  type RelationshipContext,
  type PendingIntent,
  type SourceDiscussionSnapshot,
  type WorldBasis,
} from "@/modules/agent-os";
import {
  buildCommittedWorldPresentation,
  listReviewedRecipeIdsForSource,
  type CommittedWorldPresentation,
  type PresentationPlan,
  type WorldCommand,
} from "@/modules/world";
import {
  LIVE_EXPERIENCE_ID,
  LIVE_PRINCIPAL_ID,
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
import { createDomainEventDraftBrowser } from "@/modules/reader-thinking/draft";
import {
  createReaderWorldUseCase,
  deriveWorldInvitationAcceptanceId,
} from "@/modules/reader-world/use-case";
import {
  recordInvitationQuestion,
  type MemoryEventDraftInput,
} from "@/modules/reader-world/memory";
import type { DomainEventDraft } from "@/modules/reader-world/events";
import { foldReadingGraph } from "@/modules/reader-world/projections/reading-graph";
import type { ReadingGraphView } from "@/modules/reader-world/projections/types";
import { emptyReadingGraphView } from "@/modules/reader-world/projections/types";
import { getBrowserEventStore } from "@/infrastructure/reader-thinking/browser-store";
import type {
  ReaderSessionContext,
  ReaderSessionEvent,
  SessionStateValue,
  SessionTransitionReceipt,
} from "@/modules/session";
import type { VoiceSourceSnapshot } from "@/modules/voice";
import { useReaderSession } from "./ReaderSessionProvider";
import { useVoiceInputPort } from "./VoiceInputProvider";

type UiStatus = {
  kind: "idle" | "busy" | "error" | "info";
  message: string;
  code?: string;
};

export type DiscussionSnapshotMap = Record<string, SourceDiscussionSnapshot>;

export type SubmitAgentTurnInput = Readonly<{
  sourceId: string;
  channel: "text" | "voice";
  final_text: string;
  turn_id: string;
  asr_confidence?: number;
}>;

export type AgentTurnState = Readonly<{
  pending_intent: PendingIntent | null;
  last_decision: AgentTurnDecision | null;
  committed_command_count: number;
}>;

type ThinkingApi = {
  ready: boolean;
  graph: ReadingGraphView;
  /** Current renderer-independent plan for the accepted executable world. */
  worldPresentation: PresentationPlan | null;
  /** Event-projected source/relation/event chain for the current plan. */
  worldEvidence: CommittedWorldPresentation | null;
  worldUiState: "closed" | "constructing" | "open" | "error";
  worldActionPending: boolean;
  status: UiStatus;
  activeIdeas: ReadingGraphView["ideas"];
  ideaHistory: ReadingGraphView["ideas"];
  activeThoughts: ReadingGraphView["thoughts"];
  thoughtHistory: ReadingGraphView["thoughts"];
  currentRelation: ReadingGraphView["relations"][number] | null;
  canPropose: boolean;
  candidate: BookThoughtCandidate | null;
  /** Most recently submitted source; owns shared response/world UI. */
  activeSubmittedSourceId: string | null;
  /** Live T002 evidence map (sourceId → sealed snapshot). */
  sourceEvidence: SourceEvidenceMap;
  getSourceEvidence: (sourceId: string) => SourceEvidenceSnapshot | null;
  submitIdea: (sourceId: string, text: string) => Promise<void>;
  reviseIdea: (ideaId: string, text: string) => Promise<void>;
  replayMarketFixture: () => Promise<void>;
  askSourceDiscussion: (sourceId: string, questionZh: string) => Promise<void>;
  /** T009: one final text/voice ingress, serialized at the app boundary. */
  submitAgentTurn: (
    input: SubmitAgentTurnInput,
  ) => Promise<AgentTurnDecision>;
  /** T009 working state only; never persisted to EventStore. */
  agentTurnState: AgentTurnState;
  /** T007 deterministic controls only; every ordinary final uses AgentTurn. */
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
  acceptWorldInvitation: () => Promise<boolean>;
  declineWorldInvitation: () => void;
  completeWorldConstruction: () => void;
  actInWorld: (actionId: string) => Promise<void>;
  collapseWorld: () => void;
  reopenWorld: () => void;
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

function makeClarifyDecision(
  companion_line: string,
  pending_intent_next: PendingIntent | null,
): AgentTurnDecision {
  return {
    mode: "clarify",
    candidate: null,
    companion_line,
    invitation: null,
    pending_intent_next,
    command: null,
    dispatch_receipt: null,
    idempotency_key: null,
    zero_world_mutation: true,
  };
}

function invitationBasisFromCommittedGraph(
  graph: ReadingGraphView,
  session: WorldBootstrapSession,
  sourceSnapshotId: string,
): InvitationBasis | null {
  if (
    !sourceSnapshotId ||
    graph.graph_stale ||
    graph.graph_revision < 1 ||
    !session.context.experience_id ||
    !session.context.graph_committed ||
    session.context.graph_revision !== graph.graph_revision ||
    !sameStringSet(
      session.context.accepted_relation_ids,
      graph.accepted_relation_ids,
    )
  ) {
    return null;
  }

  const relation = graph.relations.find(
    (candidate) =>
      candidate.review_status === "accepted" &&
      !candidate.stale &&
      graph.accepted_relation_ids.includes(candidate.relation_id) &&
      session.context.relation_id === candidate.relation_id &&
      session.context.relation_basis_revision === candidate.basis_revision,
  );
  if (!relation) return null;

  return {
    experience_id: session.context.experience_id,
    graph_revision: graph.graph_revision,
    relation_id: relation.relation_id,
    relation_basis_revision: relation.basis_revision,
    accepted_relation_ids: [...graph.accepted_relation_ids],
    source_snapshot_id: sourceSnapshotId,
  };
}

function worldBasisKey(basis: WorldBasis | null): string {
  return basis
    ? [
        basis.experience_id,
        basis.world_id,
        basis.graph_revision,
        basis.world_revision,
        basis.ruleset_id,
      ].join("|")
    : "none";
}

function commandMatchesWorldBasis(
  command: WorldCommand,
  basis: WorldBasis,
): boolean {
  return (
    command.experience_id === basis.experience_id &&
    command.world_id === basis.world_id &&
    command.graph_revision === basis.graph_revision &&
    command.expected_world_revision === basis.world_revision &&
    command.ruleset_id === basis.ruleset_id
  );
}

function staleDispatchReceipt(): AgentTurnDispatchReceipt {
  return {
    ok: false,
    committed: false,
    duplicate: false,
    code: "STALE",
    world_revision: null,
    event_count: 0,
  };
}

function visibleTurn(
  turn_id: string,
  role: AgentTurnVisibleTurn["role"],
  visible_text: string,
): AgentTurnVisibleTurn {
  return { turn_id, role, visible_text };
}

const WOOL_TOWN_SEED = 42;

type WorldBootstrapSession = Readonly<{
  state: SessionStateValue;
  context: ReaderSessionContext;
  send: (event: ReaderSessionEvent) => SessionTransitionReceipt;
}>;

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.every((value) => right.includes(value)) &&
    right.every((value) => left.includes(value))
  );
}

type InvitationQuestionPersistenceResult = Awaited<
  ReturnType<typeof recordInvitationQuestion>
>;

export async function persistInvitationQuestionKey(
  questionKey: string,
  invitedQuestionKeys: Set<string>,
  persist: () => Promise<InvitationQuestionPersistenceResult>,
): Promise<InvitationQuestionPersistenceResult> {
  const recorded = await persist();
  if (recorded.ok) invitedQuestionKeys.add(questionKey);
  return recorded;
}

type WorldInvitationAcceptanceIdentity = Readonly<{
  turn_id: string;
  message_id: string;
  correlation_id: string;
  recorded_at: string;
}>;

function sessionCanOpenWorld(
  session: WorldBootstrapSession,
  graph: ReadingGraphView,
  relationId: string,
  relationBasisRevision: number,
): boolean {
  const context = session.context;
  return (
    !!context.experience_id &&
    context.source_snapshot_ready &&
    context.relation_reviewed &&
    context.relation_id === relationId &&
    context.relation_basis_revision === relationBasisRevision &&
    context.graph_committed &&
    context.graph_revision === graph.graph_revision &&
    sameStringSet(context.accepted_relation_ids, graph.accepted_relation_ids)
  );
}

function invitationIsCurrent(
  invitation: AgentWorldInvitation,
  graph: ReadingGraphView,
  session: WorldBootstrapSession,
): boolean {
  const current = invitationBasisFromCommittedGraph(
    graph,
    session,
    invitation.basis.source_snapshot_id,
  );
  return (
    current !== null &&
    current.experience_id === invitation.basis.experience_id &&
    current.graph_revision === invitation.basis.graph_revision &&
    current.relation_id === invitation.basis.relation_id &&
    current.relation_basis_revision === invitation.basis.relation_basis_revision &&
    sameStringSet(
      current.accepted_relation_ids,
      invitation.basis.accepted_relation_ids,
    )
  );
}

function advanceSessionToWorld(
  session: WorldBootstrapSession,
  graph: ReadingGraphView,
  basis: Pick<InvitationBasis, "relation_id" | "relation_basis_revision">,
  worldId: string,
  worldRevision: number,
): boolean {
  if (
    session.state === "active.playable" ||
    session.state === "active.evidence"
  ) {
    return (
      session.context.world_id === worldId &&
      session.context.world_basis_graph_revision === graph.graph_revision
    );
  }
  if (
    (session.state !== "active.reading" &&
      session.state !== "active.reviewing_graph") ||
    !sessionCanOpenWorld(
      session,
      graph,
      basis.relation_id,
      basis.relation_basis_revision,
    )
  ) {
    return false;
  }
  if (
    !session.context.playability_passed ||
    session.context.playability_graph_revision !== graph.graph_revision
  ) {
    const playability = session.send({
      type: "PLAYABILITY_PASSED",
      graph_revision: graph.graph_revision,
    });
    if (!playability.accepted) return false;
  }
  const opening = session.send({
    type: "WORLD_OPEN_REQUESTED",
    graph_revision: graph.graph_revision,
  });
  const preparation = opening.requested_effects.find(
    (effect): effect is Extract<typeof effect, { kind: "prepare_world" }> =>
      effect.kind === "prepare_world",
  );
  if (!opening.accepted || !preparation) return false;
  return session.send({
    type: "WORLD_READY",
    correlation_id: preparation.correlation_id,
    graph_revision: graph.graph_revision,
    world_id: worldId,
    world_revision: worldRevision,
    effect_generation: preparation.generation,
  }).accepted;
}

function uniqueQuoteExcerpt(source: SourceDiscussionSnapshot): string {
  const normalized = source.quote.trim();
  const canonical =
    source.source_id === "smith.b1.c1.division"
      ? "seem to have been the effects of the division of labour."
      : source.source_id === "smith.b1.c3.market_extent"
        ? "by the extent of the market"
        : null;
  const canonicalStart = canonical ? normalized.indexOf(canonical) : -1;
  if (canonical && canonicalStart >= 0 && canonicalStart === normalized.lastIndexOf(canonical)) {
    return canonical;
  }
  for (let size = 64; size <= Math.min(normalized.length, 180); size += 16) {
    const excerpt = normalized.slice(0, size).trim();
    if (
      excerpt &&
      normalized.indexOf(excerpt) === normalized.lastIndexOf(excerpt)
    ) {
      return excerpt;
    }
  }
  return normalized;
}

function bookThoughtFromAgentTurn(
  decision: AgentTurnDecision,
  source: SourceDiscussionSnapshot,
  turnId: string,
): BookThoughtCandidate | null {
  const candidate = decision.candidate;
  if (
    decision.mode !== "discuss" ||
    !candidate ||
    candidate.intent_class !== "source_question"
  ) {
    return null;
  }

  // The source identity and quote come only from the server-sealed T006 map.
  // AgentTurn contributes this same turn's companion line; no second model call.
  return {
    candidate_id: `agent_turn_${turnId}`,
    answer_zh: candidate.companion_line,
    quote_exact: uniqueQuoteExcerpt(source),
    inference_zh: candidate.companion_line,
    thought_kind: "inference",
    confidence: 0.9,
    open_question: candidate.open_question ?? null,
    source_ids: [source.source_id],
    evidence_refs: [...source.evidence_refs],
    source_snapshot: source,
    stale: false,
  };
}

export function ReaderThinkingProvider({
  children,
  sourceEvidence,
  discussionSnapshots,
  relationshipContext,
  voiceSourceSnapshots,
}: {
  children: ReactNode;
  /** Built on server from loadWealthOfNationsBook SourceBlocks (F33). */
  sourceEvidence: SourceEvidenceMap;
  /** Live SourceBlock quote + evidence for T006 discussion. */
  discussionSnapshots: DiscussionSnapshotMap;
  /** Event-projected, bounded memory context for the next semantic turn. */
  relationshipContext?: RelationshipContext;
  /** Server-sealed source quote/hash map shared by text and final voice turns. */
  voiceSourceSnapshots: Readonly<Record<string, VoiceSourceSnapshot>>;
}) {
  const session = useReaderSession();
  const voiceInput = useVoiceInputPort();
  const [ready, setReady] = useState(false);
  const [graph, setGraph] = useState<ReadingGraphView>(() =>
    emptyReadingGraphView(LIVE_EXPERIENCE_ID),
  );
  const [worldPresentation, setWorldPresentation] =
    useState<PresentationPlan | null>(null);
  const [worldEvidence, setWorldEvidence] =
    useState<CommittedWorldPresentation | null>(null);
  const [worldUiState, setWorldUiState] = useState<
    "closed" | "constructing" | "open" | "error"
  >("closed");
  const [worldActionPending, setWorldActionPending] = useState(false);
  const [candidate, setCandidate] = useState<BookThoughtCandidate | null>(null);
  const [boundary, setBoundary] = useState<BoundarySession>(() =>
    emptyBoundarySession(),
  );
  const [status, setStatus] = useState<UiStatus>({
    kind: "idle",
    message: "",
  });
  const [pendingIntent, setPendingIntent] = useState<PendingIntent | null>(
    null,
  );
  const [lastAgentTurnDecision, setLastAgentTurnDecision] =
    useState<AgentTurnDecision | null>(null);
  const [committedCommandCount, setCommittedCommandCount] = useState(0);
  const [activeSubmittedSourceId, setActiveSubmittedSourceId] =
    useState<string | null>(null);
  const portsRef = useRef<{
    store: Awaited<ReturnType<typeof getBrowserEventStore>>;
    ids: ReturnType<typeof createBrowserIdPort>;
    clock: ReturnType<typeof createBrowserClockPort>;
  } | null>(null);
  /** Revision-keyed reconcile — prevents accept hot-loop / IDB thrash (F30). */
  const reconcileKeyRef = useRef<string>("");
  const actionSeqRef = useRef(0);
  const pendingIntentRef = useRef<PendingIntent | null>(null);
  const boundaryRef = useRef<BoundarySession>(boundary);
  const recentFinalTurnsRef = useRef<AgentTurnVisibleTurn[]>([]);
  const invitedQuestionKeysRef = useRef<Set<string>>(new Set());
  const worldInvitationAcceptanceIdentitiesRef = useRef<
    Map<string, WorldInvitationAcceptanceIdentity>
  >(new Map());
  const lastWorldBasisRef = useRef<WorldBasis | null>(null);
  const agentTurnChainRef = useRef<Promise<void>>(Promise.resolve());
  const agentTurnGenerationRef = useRef(0);
  const agentTurnCacheRef = useRef<
    Map<string, { fingerprint: string; decision: AgentTurnDecision }>
  >(new Map());
  const graphRef = useRef(graph);
  const sessionRef = useRef(session);
  const worldPresentationRef = useRef<PresentationPlan | null>(null);
  const worldOperationGenerationRef = useRef(0);
  const worldRestoreKeyRef = useRef("");

  useEffect(() => {
    boundaryRef.current = boundary;
  }, [boundary]);

  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    worldPresentationRef.current = worldPresentation;
  }, [worldPresentation]);

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

  const setWorkingPending = useCallback((next: PendingIntent | null) => {
    pendingIntentRef.current = next;
    setPendingIntent(next);
  }, []);

  const sealedSourceScope = useMemo(
    () =>
      Object.values(voiceSourceSnapshots)
        .map(
          (snapshot) =>
            `${snapshot.sourceId}:${snapshot.editionId}:${snapshot.contentHash}`,
        )
        .sort()
        .join(","),
    [voiceSourceSnapshots],
  );

  const agentTurnScope = useMemo(
    () =>
      [
        session.context.experience_id ?? "",
        session.context.source_snapshot_ids.join(","),
        session.context.graph_revision ?? "",
        session.context.world_id ?? "",
        session.context.world_revision ?? "",
        session.context.world_basis_graph_revision ?? "",
        sealedSourceScope,
      ].join("|"),
    [sealedSourceScope, session.context],
  );
  const agentTurnScopeRef = useRef("");

  useEffect(() => {
    if (agentTurnScopeRef.current === agentTurnScope) return;
    agentTurnScopeRef.current = agentTurnScope;
    // Pending and retry receipts are session work state. They never cross a
    // source, experience, graph/world revision, or a later explicit Stop.
    agentTurnGenerationRef.current += 1;
    pendingIntentRef.current = null;
    recentFinalTurnsRef.current = [];
    lastWorldBasisRef.current = null;
    agentTurnCacheRef.current.clear();
    setPendingIntent(null);
    setLastAgentTurnDecision(null);
    setCommittedCommandCount(0);
    setStatus((current) =>
      current.kind === "busy" ? { kind: "idle", message: "" } : current,
    );
  }, [agentTurnScope]);

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

  const discussionResolver = useMemo(
    () => createMapSourceDiscussionResolver(discussionSnapshots),
    [discussionSnapshots],
  );

  const getReaderWorldUseCase = useCallback(() => {
    const ports = portsRef.current;
    if (!ports) return null;
    const dispatchWorld = createWorldDispatchPort({
      store: ports.store,
      principal_id: LIVE_PRINCIPAL_ID,
      draft_factory: (draft) =>
        createDomainEventDraftBrowser({
          ...draft,
          recorded_at: ports.clock.nowRfc3339(),
        }),
    });
    return createReaderWorldUseCase({
      store: ports.store,
      principal_id: LIVE_PRINCIPAL_ID,
      draft_factory: (draft) => createDomainEventDraftBrowser(draft),
      dispatch_world: dispatchWorld,
    });
  }, []);

  const projectWorldEvidence = useCallback(
    async (
      plan: PresentationPlan,
      experienceId: string,
    ): Promise<CommittedWorldPresentation | null> => {
      const store = portsRef.current?.store;
      if (!store) return null;
      const loaded = await store.load(experienceId);
      if (!loaded.ok) return null;
      const committedGraph = foldReadingGraph(experienceId, loaded.value);
      if (
        committedGraph.graph_stale ||
        committedGraph.graph_revision !== plan.basis.graph_revision ||
        committedGraph.accepted_relation_ids.length === 0
      ) {
        return null;
      }
      const sources = Object.values(discussionSnapshots);
      return buildCommittedWorldPresentation({
        events: loaded.value,
        sources,
        session: {
          state: "active.playable",
          context: {
            experience_id: experienceId,
            source_snapshot_ids: sources.map((source) => source.source_id),
            source_snapshot_ready: sources.length > 0,
            relation_reviewed: true,
            graph_revision: committedGraph.graph_revision,
            graph_committed: true,
            accepted_relation_ids: committedGraph.accepted_relation_ids,
            playability_passed: true,
            playability_graph_revision: committedGraph.graph_revision,
            world_id: plan.basis.world_id,
            world_revision: plan.basis.world_revision,
            world_basis_graph_revision: committedGraph.graph_revision,
          },
        },
      });
    },
    [discussionSnapshots],
  );


  useEffect(() => {
    const accepted = graph.relations.find(
      (relation) =>
        relation.review_status === "accepted" &&
        !relation.stale &&
        graph.accepted_relation_ids.includes(relation.relation_id),
    );
    const experienceId = session.context.experience_id;
    if (
      !ready ||
      !accepted ||
      !experienceId ||
      !session.context.graph_committed ||
      session.context.graph_revision !== graph.graph_revision ||
      worldPresentationRef.current
    ) {
      return;
    }
    const restoreKey = [experienceId, graph.graph_revision].join("|");
    if (worldRestoreKeyRef.current === restoreKey) return;
    worldRestoreKeyRef.current = restoreKey;

    let cancelled = false;
    let restored = false;
    void (async () => {
      const world = getReaderWorldUseCase();
      if (!world) return;
      const presented = await world.restore({
        experience_id: experienceId,
        reduced_motion: window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches,
      });
      if (!presented.ok || cancelled) return;
      const evidence = await projectWorldEvidence(
        presented.presentation,
        experienceId,
      );
      if (!evidence || cancelled) return;
      if (
        !advanceSessionToWorld(
          sessionRef.current,
          graphRef.current,
          {
            relation_id: accepted.relation_id,
            relation_basis_revision: accepted.basis_revision,
          },
          presented.presentation.basis.world_id,
          presented.presentation.basis.world_revision,
        )
      ) {
        return;
      }
      restored = true;
      worldPresentationRef.current = presented.presentation;
      setWorldPresentation(presented.presentation);
      setWorldEvidence(evidence);
      setActiveSubmittedSourceId(
        presented.presentation.source.legacy_source_id,
      );
      setWorldUiState("closed");
      setStatus({
        kind: "info",
        message: `上次的世界停在修订 ${presented.presentation.basis.world_revision}，可继续进入。`,
      });
    })();
    return () => {
      cancelled = true;
      if (
        !restored &&
        worldRestoreKeyRef.current === restoreKey
      ) {
        worldRestoreKeyRef.current = "";
      }
    };
  }, [
    getReaderWorldUseCase,
    graph,
    projectWorldEvidence,
    ready,
    session,
  ]);
  const acceptWorldInvitation = useCallback(async (): Promise<boolean> => {
    const invitation = lastAgentTurnDecision?.invitation;
    const ports = portsRef.current;
    const world = getReaderWorldUseCase();
    const currentSession = sessionRef.current;
    const currentGraph = graphRef.current;
    if (
      !invitation ||
      !ports ||
      !world ||
      !invitationIsCurrent(invitation, currentGraph, currentSession)
    ) {
      setStatus({
        kind: "error",
        message: "这次世界邀请已经过期，请先回到当前原文重新问一次。",
        code: "WORLD_INVITATION_STALE",
      });
      return false;
    }

    let acceptanceIdentity =
      worldInvitationAcceptanceIdentitiesRef.current.get(
        invitation.question_key,
      );
    if (!acceptanceIdentity) {
      acceptanceIdentity = {
        turn_id: deriveWorldInvitationAcceptanceId(invitation.question_key),
        message_id: ports.ids.nextId("msg"),
        correlation_id: ports.ids.nextId("corr"),
        recorded_at: ports.clock.nowRfc3339(),
      };
      worldInvitationAcceptanceIdentitiesRef.current.set(
        invitation.question_key,
        acceptanceIdentity,
      );
    }

    const generation = ++worldOperationGenerationRef.current;
    setWorldUiState("constructing");
    setWorldActionPending(false);
    setStatus({ kind: "busy", message: "正在把关系编译成可操作世界…" });
    const accepted = await world.acceptInvitation({
      invitation,
      ...acceptanceIdentity,
      seed: WOOL_TOWN_SEED,
      reduced_motion: window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches,
    });
    if (generation !== worldOperationGenerationRef.current) return false;
    if (!accepted.ok) {
      setWorldUiState("error");
      setStatus({
        kind: "error",
        message: "世界没有通过一致性检查，原文与关系都没有被改动。",
        code: accepted.code,
      });
      return false;
    }
    if (
      !advanceSessionToWorld(
        currentSession,
        currentGraph,
        invitation.basis,
        accepted.presentation.basis.world_id,
        accepted.presentation.basis.world_revision,
      )
    ) {
      setWorldUiState("error");
      setStatus({
        kind: "error",
        message: "阅读状态已经变化，世界先不打开。",
        code: "SESSION_NOT_READY",
      });
      return false;
    }
    const evidence = await projectWorldEvidence(
      accepted.presentation,
      invitation.basis.experience_id,
    );
    if (generation !== worldOperationGenerationRef.current) return false;
    if (!evidence) {
      setWorldEvidence(null);
      setWorldUiState("error");
      setStatus({
        kind: "error",
        message: "世界已经提交，但证据链无法完整重建，暂不显示。",
        code: "WORLD_EVIDENCE_UNAVAILABLE",
      });
      return false;
    }

    worldPresentationRef.current = accepted.presentation;
    setWorldPresentation(accepted.presentation);
    setWorldEvidence(evidence);
    setWorldUiState("constructing");
    setStatus({
      kind: "info",
      message: "世界已提交，正在把规则、角色与材料流放进原文。",
    });
    return true;
  }, [
    getReaderWorldUseCase,
    lastAgentTurnDecision,
    projectWorldEvidence,
  ]);

  const declineWorldInvitation = useCallback(() => {
    worldOperationGenerationRef.current += 1;
    setWorldUiState("closed");
    setWorldPresentation(null);
    setWorldEvidence(null);
    worldPresentationRef.current = null;
    setLastAgentTurnDecision(
      makeClarifyDecision("好，我们继续沿着原文读。", null),
    );
    setStatus({ kind: "info", message: "世界邀请已收起，阅读继续。" });
  }, []);

  const completeWorldConstruction = useCallback(() => {
    if (worldPresentationRef.current) setWorldUiState("open");
  }, []);

  const collapseWorld = useCallback(() => {
    worldOperationGenerationRef.current += 1;
    sessionRef.current.send({ type: "COLLAPSE" });
    setWorldUiState("closed");
    setWorldActionPending(false);
    setStatus({ kind: "info", message: "世界已收起，阅读位置保持不变。" });
  }, []);

  const reopenWorld = useCallback(() => {
    if (!worldPresentationRef.current) return;
    setWorldUiState("open");
    setStatus({ kind: "info", message: "已回到刚才的世界。" });
  }, []);

  const actInWorld = useCallback(
    async (actionId: string): Promise<void> => {
      const plan = worldPresentationRef.current;
      const ports = portsRef.current;
      const world = getReaderWorldUseCase();
      const experienceId = sessionRef.current.context.experience_id;
      const action =
        actionId === "deepen_specialization" || actionId === "expand_market"
          ? (actionId satisfies AgentTurnActionId)
          : null;
      if (
        !plan ||
        !ports ||
        !world ||
        !experienceId ||
        !action ||
        !plan.actions.some((candidate) => candidate.action_id === action)
      ) {
        setStatus({
          kind: "error",
          message: "这个动作不属于当前世界。",
          code: "WORLD_ACTION_UNAVAILABLE",
        });
        return;
      }
      const generation = ++worldOperationGenerationRef.current;
      setWorldActionPending(true);
      setStatus({ kind: "busy", message: "角色正在依据规则回应…" });
      const turnId = ports.ids.nextId("world_action");
      const acted = await world.act({
        experience_id: experienceId,
        reduced_motion: window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches,
        turn_id: turnId,
        idempotency_key: deriveWorldActionIdempotencyKey(turnId, action, {
          experience_id: experienceId,
          world_id: plan.basis.world_id,
          graph_revision: plan.basis.graph_revision,
          world_revision: plan.basis.world_revision,
          ruleset_id: plan.basis.ruleset_id,
        }),
        command: {
          action,
          experience_id: experienceId,
          world_id: plan.basis.world_id,
          graph_revision: plan.basis.graph_revision,
          expected_world_revision: plan.basis.world_revision,
          ruleset_id: plan.basis.ruleset_id,
        },
      });
      if (generation !== worldOperationGenerationRef.current) return;
      setWorldActionPending(false);
      if (!acted.ok) {
        setStatus({
          kind: "error",
          message: "世界拒绝了这次动作，已提交状态保持不变。",
          code: acted.code,
        });
        return;
      }
      const evidence = await projectWorldEvidence(
        acted.presentation,
        experienceId,
      );
      if (generation !== worldOperationGenerationRef.current) return;
      if (!evidence) {
        setWorldEvidence(null);
        setWorldUiState("error");
        setStatus({
          kind: "error",
          message: "动作已经提交，但证据链无法完整重建，暂不显示。",
          code: "WORLD_EVIDENCE_UNAVAILABLE",
        });
        return;
      }
      worldPresentationRef.current = acted.presentation;
      setWorldPresentation(acted.presentation);
      setWorldEvidence(evidence);
      setWorldUiState("open");
      setStatus({
        kind: "info",
        message: `世界已推进到修订 ${acted.presentation.basis.world_revision}。`,
      });
    },
    [getReaderWorldUseCase, projectWorldEvidence],
  );

  const inspectAgentTurnBasis = useCallback(async (): Promise<WorldBasis | null> => {
    const currentSession = sessionRef.current;
    const experienceId = currentSession.context.experience_id;
    if (currentSession.state !== "active.playable" || !experienceId) return null;

    const ports = portsRef.current;
    if (!ports) return null;
    const inspected = await inspectCurrentWorld({
      store: ports.store,
      experience_id: experienceId,
    });
    if (!inspected.ok || inspected.world_state.phase !== "playable") return null;

    const state = inspected.world_state;
    // ReaderSession gates lifecycle; the raw stream is the authority for the
    // actionable revision/ruleset. Do not reuse Session's stale revision after
    // a committed dispatch before T010 consumes the projection.
    if (
      currentSession.context.world_id !== state.world_id ||
      currentSession.context.graph_revision !== state.graph_revision ||
      currentSession.context.world_basis_graph_revision !== state.graph_revision
    ) {
      return null;
    }

    return {
      experience_id: experienceId,
      world_id: state.world_id,
      graph_revision: state.graph_revision,
      world_revision: state.world_revision,
      ruleset_id: state.ruleset_id,
    };
  }, []);

  const publishAgentTurnDecision = useCallback(
    async (
      input: SubmitAgentTurnInput,
      decision: AgentTurnDecision,
      source: SourceDiscussionSnapshot | null,
      options: { countCommitted: boolean; generation: number },
    ): Promise<boolean> => {
      if (options.generation !== agentTurnGenerationRef.current) return false;
      setWorkingPending(decision.pending_intent_next);
      setLastAgentTurnDecision(decision);
      if (decision.mode === "invite_world" && decision.invitation) {
        const invitation = decision.invitation;
        const currentPorts = portsRef.current;
        const experienceId = sessionRef.current.context.experience_id;
        if (!currentPorts || !experienceId) {
          setStatus({
            kind: "error",
            message: "邀请已显示，但跨会话记录失败。",
            code: "STORE_UNAVAILABLE",
          });
          return false;
        }

        const questionKey = invitation.question_key;
        const recorded = await persistInvitationQuestionKey(
          questionKey,
          invitedQuestionKeysRef.current,
          () =>
            recordInvitationQuestion({
              store: currentPorts.store,
              experience_id: experienceId,
              principal_id: LIVE_PRINCIPAL_ID,
              question_key: questionKey,
              source_id:
                source?.source_id ?? invitation.basis.source_snapshot_id,
              ports: {
                next_id: () => currentPorts.ids.nextId("memory"),
                now: currentPorts.clock.nowRfc3339,
                create_event_draft: async (
                  draft: MemoryEventDraftInput,
                ): Promise<DomainEventDraft> =>
                  (await createDomainEventDraftBrowser(draft)) as DomainEventDraft,
              },
            }),
        );
        if (!recorded.ok) {
          setStatus({
            kind: "error",
            message: "邀请已显示，但跨会话记录失败。",
            code: recorded.error.code,
          });
          return false;
        }
      }

      if (
        options.countCommitted &&
        decision.mode === "act" &&
        decision.dispatch_receipt?.committed &&
        !decision.dispatch_receipt.duplicate
      ) {
        setCommittedCommandCount((count) => count + 1);
      }

      const reader = visibleTurn(input.turn_id, "reader", input.final_text.trim());
      const companion = visibleTurn(
        `companion:${input.turn_id}`,
        "companion",
        decision.companion_line,
      );
      const withoutThisTurn = recentFinalTurnsRef.current.filter(
        (turn) => turn.turn_id !== reader.turn_id && turn.turn_id !== companion.turn_id,
      );
      recentFinalTurnsRef.current = [...withoutThisTurn, reader, companion].slice(-4);

      if (decision.mode === "stop") {
        // The microphone must release before the session becomes paused, so a
        // late final cannot land in a newly paused/changed reading state.
        await voiceInput.stopActive("user");
        const currentSession = sessionRef.current;
        if (currentSession.state !== "paused") {
          currentSession.send({ type: "STOP" });
        }
        setWorkingPending(null);
        recentFinalTurnsRef.current = [];
        lastWorldBasisRef.current = null;
        agentTurnCacheRef.current.clear();
        agentTurnGenerationRef.current += 1;
        setLastAgentTurnDecision(null);
        setCommittedCommandCount(0);
        setCandidate(null);
      } else if (source) {
        const thought = bookThoughtFromAgentTurn(decision, source, input.turn_id);
        if (thought) {
          setCandidate(thought);
        } else if (decision.candidate?.intent_class === "obvious_off_topic_noise") {
          // T007 remains only a post-semantic soft-return presentation reducer.
          const boundaryResult = reduceBoundary(boundaryRef.current, {
            type: "SUBMIT",
            text: input.final_text,
            active_source_id: input.sourceId,
          });
          boundaryRef.current = boundaryResult.session;
          setBoundary(boundaryResult.session);
          setCandidate(null);
        } else {
          setCandidate(null);
        }
      }

      setStatus({
        kind: "info",
        message: decision.companion_line,
      });
      return true;
    },
    [setWorkingPending, voiceInput],
  );

  const executeAgentTurn = useCallback(
    async (
      input: SubmitAgentTurnInput,
      generation: number,
      scrollY: number,
    ): Promise<AgentTurnDecision> => {
      const stale = () =>
        makeClarifyDecision("这一句已经过期，世界先不动。", null);
      if (generation !== agentTurnGenerationRef.current) return stale();
      const sourceSnapshot = voiceSourceSnapshots[input.sourceId];
      const source = discussionResolver.get(input.sourceId);
      const sourceSnapshotId = sourceSnapshot
        ? deriveAgentTurnSourceSnapshotId(
            sourceSnapshot.sourceId,
            sourceSnapshot.contentHash,
          )
        : "";
      const fingerprint = [
        input.channel,
        input.final_text.trim(),
        sourceSnapshotId,
      ].join("\n");
      const cached = agentTurnCacheRef.current.get(input.turn_id);
      if (cached) {
        if (cached.fingerprint !== fingerprint) {
          const mismatch = makeClarifyDecision(
            "这次转写和前一条对不上，世界先不动。",
            pendingIntentRef.current,
          );
          const published = await publishAgentTurnDecision(input, mismatch, source, {
            countCommitted: false,
            generation,
          });
          return published ? mismatch : stale();
        }
        const replay = cached.decision.dispatch_receipt
          ? {
              ...cached.decision,
              dispatch_receipt: {
                ...cached.decision.dispatch_receipt,
                duplicate: true,
              },
              zero_world_mutation: true,
            }
          : cached.decision;
        const published = await publishAgentTurnDecision(input, replay, source, {
          countCommitted: false,
          generation,
        });
        return published ? replay : stale();
      }

      if (
        !sourceSnapshot ||
        sourceSnapshot.sourceId !== input.sourceId ||
        !sourceSnapshotId
      ) {
        const unavailable = makeClarifyDecision(
          "当前原文没接稳，世界先不动。",
          null,
        );
        agentTurnCacheRef.current.set(input.turn_id, {
          fingerprint,
          decision: unavailable,
        });
        const published = await publishAgentTurnDecision(input, unavailable, source, {
          countCommitted: false,
          generation,
        });
        return published ? unavailable : stale();
      }

      setStatus({ kind: "busy", message: "正在理解这一句…" });
      let basis: WorldBasis | null = null;
      try {
        basis = await inspectAgentTurnBasis();
      } catch {
        basis = null;
      }
      if (generation !== agentTurnGenerationRef.current) return stale();

      const previousBasis = lastWorldBasisRef.current;
      if (
        previousBasis &&
        worldBasisKey(previousBasis) !== worldBasisKey(basis)
      ) {
        // A fresh final after the basis moved can never consume an older
        // ellipsis. The retry cache is also scoped to that basis.
        setWorkingPending(null);
        agentTurnCacheRef.current.clear();
      }
      lastWorldBasisRef.current = basis;

      const ports = portsRef.current;
      const world = getReaderWorldUseCase();
      const dispatch: AgentTurnDispatchPort | null = world
        ? async (request) => {
            if (generation !== agentTurnGenerationRef.current) {
              return staleDispatchReceipt();
            }
            let currentBasis: WorldBasis | null = null;
            try {
              currentBasis = await inspectAgentTurnBasis();
            } catch {
              return staleDispatchReceipt();
            }
            if (
              generation !== agentTurnGenerationRef.current ||
              !currentBasis ||
              !commandMatchesWorldBasis(request.command, currentBasis)
            ) {
              return staleDispatchReceipt();
            }
            setWorldActionPending(true);
            const acted = await world.act({
              experience_id: request.command.experience_id,
              reduced_motion: window.matchMedia(
                "(prefers-reduced-motion: reduce)",
              ).matches,
              turn_id: request.turn_id,
              command: request.command,
              idempotency_key: request.idempotency_key,
            });
            setWorldActionPending(false);
            if (!acted.ok) return staleDispatchReceipt();
            const evidence = await projectWorldEvidence(
              acted.presentation,
              request.command.experience_id,
            );
            if (!evidence) {
              setWorldEvidence(null);
              setWorldUiState("error");
              setStatus({
                kind: "error",
                message: "动作已经提交，但证据链无法完整重建，暂不显示。",
                code: "WORLD_EVIDENCE_UNAVAILABLE",
              });
              return acted.dispatch;
            }
            worldPresentationRef.current = acted.presentation;
            setWorldPresentation(acted.presentation);
            setWorldEvidence(evidence);
            setWorldUiState("open");
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                window.scrollTo({ top: scrollY, behavior: "auto" });
              });
            });
            return acted.dispatch;
          }
        : null;
      const scopedRelationshipContext = relationshipContext
        ? {
            ...relationshipContext,
            active_recipe_ids: [
              ...listReviewedRecipeIdsForSource(sourceSnapshot.sourceId),
            ],
          }
        : undefined;
      const decision = ports
        ? await handleAgentTurn(
            {
              turn_id: input.turn_id,
              channel: input.channel,
              final_text: input.final_text,
              source_snapshot_id: sourceSnapshotId,
              active_source_ids: [sourceSnapshot.sourceId],
              world_basis: basis,
              invitation_basis: invitationBasisFromCommittedGraph(
                graphRef.current,
                sessionRef.current,
                sourceSnapshotId,
              ),
              ...(input.asr_confidence === undefined
                ? {}
                : { asr_confidence: input.asr_confidence }),
              recent_turns: recentFinalTurnsRef.current.slice(-4),
              invited_question_keys: [
                ...new Set([
                  ...(scopedRelationshipContext?.invited_question_keys ?? []),
                  ...invitedQuestionKeysRef.current,
                ]),
              ],
              ...(scopedRelationshipContext
                ? { relationship_context: scopedRelationshipContext }
                : {}),
              pending_intent: pendingIntentRef.current,
            },
            {
              provider: createAgentTurnClientProvider(sourceSnapshot),
              dispatch: dispatch!,
            },
          )
        : makeClarifyDecision("世界还没准备好，先不动。", null);

      if (generation !== agentTurnGenerationRef.current) return stale();

      agentTurnCacheRef.current.set(input.turn_id, { fingerprint, decision });
      const published = await publishAgentTurnDecision(input, decision, source, {
        countCommitted: true,
        generation,
      });
      return published ? decision : stale();
    },
    [
      discussionResolver,
      getReaderWorldUseCase,
      inspectAgentTurnBasis,
      publishAgentTurnDecision,
      projectWorldEvidence,
      setWorkingPending,
      voiceSourceSnapshots,
      relationshipContext,
    ],
  );

  const submitAgentTurn = useCallback(
    (input: SubmitAgentTurnInput): Promise<AgentTurnDecision> => {
      setActiveSubmittedSourceId(input.sourceId);
      const scrollY = window.scrollY;
      const control = classifyIntent(input.final_text);
      if (
        control.intent === "explicit_stop" ||
        control.intent === "decline_return"
      ) {
        // Stop/refusal must invalidate an in-flight semantic turn immediately,
        // before it waits behind that turn in the serialized queue.
        agentTurnGenerationRef.current += 1;
      }
      if (control.intent === "explicit_stop") {
        const result = reduceBoundary(boundaryRef.current, {
          type: "SUBMIT",
          text: input.final_text,
          active_source_id: input.sourceId,
        });
        boundaryRef.current = result.session;
        setBoundary(result.session);
      }
      const generation = agentTurnGenerationRef.current;
      const run = async () => executeAgentTurn(input, generation, scrollY);
      const queued = agentTurnChainRef.current.then(run, run);
      agentTurnChainRef.current = queued.then(
        () => undefined,
        () => undefined,
      );
      return queued;
    },
    [executeAgentTurn],
  );

  const api = useMemo<ThinkingApi>(() => {
    const ports = () => {
      if (!portsRef.current) throw new Error("store not ready");
      return portsRef.current;
    };

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
      worldPresentation,
      worldEvidence,
      worldUiState,
      worldActionPending,
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
      activeSubmittedSourceId,
      sourceEvidence,
      getSourceEvidence: resolveEvidence,
      reload,
      askSourceDiscussion: (sourceId, questionZh) =>
        submitAgentTurn({
          sourceId,
          channel: "text",
          final_text: questionZh,
          turn_id: nextIdempotency("agent_turn_discussion"),
        }).then(() => undefined),
      submitAgentTurn,
      agentTurnState: {
        pending_intent: pendingIntent,
        last_decision: lastAgentTurnDecision,
        committed_command_count: committedCommandCount,
      },
      submitBoundaryInput: async (sourceId, text) => {
        setActiveSubmittedSourceId(sourceId);
        const control = classifyIntent(text);
        if (control.intent === "explicit_stop") {
          await submitAgentTurn({
            sourceId,
            channel: "text",
            final_text: text,
            turn_id: nextIdempotency("agent_turn_stop"),
          });
          return;
        }

        if (
          control.intent === "continue" ||
          control.intent === "decline_return"
        ) {
          const result = reduceBoundary(boundaryRef.current, {
            type: "SUBMIT",
            text,
            active_source_id: sourceId,
          });
          boundaryRef.current = result.session;
          setBoundary(result.session);
          if (result.effect.type === "SESSION_RESUME") {
            const currentSession = sessionRef.current;
            if (currentSession.state === "paused") {
              const receipt = currentSession.send({ type: "RESUME" });
              if (!receipt.accepted) {
                setStatus({
                  kind: "error",
                  message: `继续未生效: ${receipt.reason_code}`,
                  code: receipt.reason_code,
                });
                return;
              }
            }
            setStatus({ kind: "info", message: "已继续；回引提醒已恢复。" });
            return;
          }
          setWorkingPending(null);
          setCandidate(null);
          setStatus({
            kind: "info",
            message: result.session.status_hint ?? "已关闭回引。",
          });
          return;
        }

        await submitAgentTurn({
          sourceId,
          channel: "text",
          final_text: text,
          turn_id: nextIdempotency("agent_turn_text"),
        });
      },
      declineSoftReturn: () => {
        const result = reduceBoundary(boundaryRef.current, {
          type: "SUBMIT",
          text: "不用了",
          active_source_id: null,
        });
        boundaryRef.current = result.session;
        setBoundary(result.session);
        setWorkingPending(null);
        setCandidate(null);
        setStatus({
          kind: "info",
          message: result.session.status_hint ?? "已关闭回引。",
        });
      },
      dismissSoftReturn: () => {
        const result = reduceBoundary(boundaryRef.current, {
          type: "DISMISS_SOFT_RETURN",
        });
        boundaryRef.current = result.session;
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
        setActiveSubmittedSourceId(sourceId);
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
          setWorldUiState("closed");
          setStatus({
            kind: "info",
            message: "关系已确认。继续围绕原文提问，Agent 会在合适时邀请你进入世界。",
          });
        });
      },
      acceptWorldInvitation,
      declineWorldInvitation,
      completeWorldConstruction,
      actInWorld,
      collapseWorld,
      reopenWorld,
    };
  }, [
    ready,
    graph,
    worldPresentation,
    worldEvidence,
    worldUiState,
    worldActionPending,
    status,
    candidate,
    activeSubmittedSourceId,
    boundary,
    reload,
    withBusy,
    applyGraph,
    showError,
    session,
    nextIdempotency,
    sourceEvidence,
    resolveEvidence,
    discussionResolver,
    submitAgentTurn,
    pendingIntent,
    lastAgentTurnDecision,
    committedCommandCount,
    setWorkingPending,
    acceptWorldInvitation,
    declineWorldInvitation,
    completeWorldConstruction,
    actInWorld,
    collapseWorld,
    reopenWorld,
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

/** A single visible outcome surface for the authoritative final AgentTurn. */
export function AgentTurnCompanionLine() {
  const { agentTurnState } = useReaderThinking();
  const decision = agentTurnState.last_decision;
  if (!decision) return null;

  return (
    <div
      className="agent-turn-surface"
      data-testid="agent-turn-surface"
      data-agent-turn-mode={decision.mode}
      aria-live="polite"
    >
      <p data-testid="agent-turn-companion-line">{decision.companion_line}</p>
    </div>
  );
}
