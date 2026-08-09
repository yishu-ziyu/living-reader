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
  emptyBoundarySession,
  handleAgentTurn,
  inspectCurrentWorld,
  proposeCanonicalRelation,
  reduceBoundary,
  rejectRelation,
  reviseRelation,
  tryCanonicalConstrainedBy,
  type AgentTurnDecision,
  type AgentTurnDispatchPort,
  type AgentTurnDispatchReceipt,
  type AgentTurnVisibleTurn,
  type BookThoughtCandidate,
  type BoundarySession,
  type InvitationBasis,
  type PendingIntent,
  type SourceDiscussionSnapshot,
  type WorldBasis,
} from "@/modules/agent-os";
import {
  buildCommittedWorldPresentation,
  WOOL_TOWN_RULESET_ID,
  type CommittedWorldPresentation,
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
  validateAndSealSourceEvidence,
  type SourceEvidenceMap,
  type SourceEvidenceSnapshot,
  type ThinkingError,
} from "@/modules/reader-thinking";
import { createDomainEventDraftBrowser } from "@/modules/reader-thinking/draft";
import type { EventStore } from "@/modules/reader-world/event-store";
import type { DomainEvent } from "@/modules/reader-world/events";
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
  /** Null unless the raw stream and Session gate jointly prove a committed view. */
  worldPresentation: CommittedWorldPresentation | null;
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

type GraphCommittedEvent = Extract<
  DomainEvent,
  { message_name: "reader_world.graph.committed.v1" }
>;
type WorldSeededEvent = Extract<
  DomainEvent,
  { message_name: "reader_world.world.seeded.v1" }
>;

type WorldBootstrapSession = Readonly<{
  state: SessionStateValue;
  context: ReaderSessionContext;
  send: (event: ReaderSessionEvent) => SessionTransitionReceipt;
}>;

export type WorldBootstrapResult =
  | Readonly<{
      status: "opened";
      seeded: boolean;
      world_id: string;
      world_revision: number;
    }>
  | Readonly<{
      status: "blocked";
      reason:
        | "EVIDENCE_UNAVAILABLE"
        | "GRAPH_NOT_CURRENT"
        | "SESSION_NOT_READY"
        | "WORLD_IDENTITY_MISMATCH"
        | "STORE_UNAVAILABLE";
    }>;

export type BootstrapCommittedWoolTownInput = Readonly<{
  store: EventStore;
  graph: ReadingGraphView;
  sourceEvidence: SourceEvidenceMap;
  session: WorldBootstrapSession;
  ids: { nextId: (prefix: string) => string };
  clock: { nowRfc3339: () => string };
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

function isSubset(values: readonly string[], allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return values.every((value) => allowedSet.has(value));
}

function graphCommitEvent(event: DomainEvent): event is GraphCommittedEvent {
  return event.message_name === "reader_world.graph.committed.v1";
}

function worldSeededEvent(event: DomainEvent): event is WorldSeededEvent {
  return event.message_name === "reader_world.world.seeded.v1";
}

function currentEvidenceIsValid(
  graph: ReadingGraphView,
  sourceEvidence: SourceEvidenceMap,
  session: WorldBootstrapSession,
): boolean {
  const canonical = tryCanonicalConstrainedBy(graph);
  const accepted = graph.relations.find(
    (relation) =>
      relation.relation_id === canonical?.relation_id &&
      relation.review_status === "accepted" &&
      !relation.stale &&
      graph.accepted_relation_ids.includes(relation.relation_id),
  );
  if (
    !canonical ||
    !accepted ||
    accepted.from_id !== canonical.from_id ||
    accepted.to_id !== canonical.to_id ||
    accepted.relation_type !== canonical.relation_type ||
    accepted.basis_revision !== canonical.basis_revision ||
    !sameStringSet(accepted.evidence_refs, canonical.evidence_refs)
  ) {
    return false;
  }

  const ideas = [canonical.from_id, canonical.to_id].map((ideaId) =>
    graph.ideas.find(
      (idea) => idea.idea_id === ideaId && idea.status === "active",
    ),
  );
  if (ideas.some((idea) => !idea)) return false;

  const allowedEvidence = new Set<string>();
  for (const idea of ideas) {
    if (!idea) return false;
    for (const sourceId of idea.source_ids) {
      if (!session.context.source_snapshot_ids.includes(sourceId)) return false;
      const source = sourceEvidence[sourceId];
      if (!source || source.source_id !== sourceId) return false;
      const sealed = validateAndSealSourceEvidence({
        source_id: source.source_id,
        fragment: source.fragment,
        pdf_page: source.pdf_page,
        print_page: source.print_page,
        edition_id: source.edition_id,
        edition_revision: source.edition_revision,
        edition_content_hash: source.edition_content_hash,
        source_content_hash: source.source_content_hash,
      });
      if (
        !sealed.ok ||
        !sameStringSet(source.evidence_refs, sealed.value.evidence_refs)
      ) {
        return false;
      }
      for (const evidenceRef of sealed.value.evidence_refs) {
        allowedEvidence.add(evidenceRef);
      }
    }
    if (!isSubset(idea.evidence_refs, [...allowedEvidence])) return false;
  }

  return (
    isSubset(canonical.evidence_refs, [...allowedEvidence]) &&
    isSubset(accepted.evidence_refs, [...allowedEvidence])
  );
}

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

/**
 * T010's sole production bootstrap: raw accepted graph + sealed evidence install
 * the canonical seed in one EventStore append, then advance only via Session events.
 */
export async function bootstrapCommittedWoolTown(
  input: BootstrapCommittedWoolTownInput,
): Promise<WorldBootstrapResult> {
  const experienceId = input.session.context.experience_id;
  if (!experienceId) {
    return { status: "blocked", reason: "SESSION_NOT_READY" };
  }

  const loaded = await input.store.load(experienceId);
  if (!loaded.ok) return { status: "blocked", reason: "STORE_UNAVAILABLE" };
  const events = loaded.value;
  const rawGraph = foldReadingGraph(experienceId, events);
  if (
    rawGraph.graph_stale ||
    input.graph.graph_stale ||
    rawGraph.graph_revision < 1 ||
    rawGraph.graph_revision !== input.graph.graph_revision ||
    !sameStringSet(rawGraph.accepted_relation_ids, input.graph.accepted_relation_ids)
  ) {
    return { status: "blocked", reason: "GRAPH_NOT_CURRENT" };
  }

  const canonical = tryCanonicalConstrainedBy(rawGraph);
  const accepted = rawGraph.relations.find(
    (relation) =>
      relation.relation_id === canonical?.relation_id &&
      relation.review_status === "accepted" &&
      !relation.stale &&
      rawGraph.accepted_relation_ids.includes(relation.relation_id),
  );
  if (!canonical || !accepted) {
    return { status: "blocked", reason: "GRAPH_NOT_CURRENT" };
  }
  if (!currentEvidenceIsValid(rawGraph, input.sourceEvidence, input.session)) {
    return { status: "blocked", reason: "EVIDENCE_UNAVAILABLE" };
  }
  if (
    !sessionCanOpenWorld(
      input.session,
      rawGraph,
      accepted.relation_id,
      accepted.basis_revision,
    )
  ) {
    return { status: "blocked", reason: "SESSION_NOT_READY" };
  }

  const graphCommits = events.filter(graphCommitEvent);
  const graphCommit = graphCommits[graphCommits.length - 1];
  if (
    !graphCommit ||
    graphCommit.payload.graph_revision !== rawGraph.graph_revision ||
    !sameStringSet(
      graphCommit.payload.accepted_relation_ids,
      rawGraph.accepted_relation_ids,
    )
  ) {
    return { status: "blocked", reason: "GRAPH_NOT_CURRENT" };
  }

  const canonicalWorldId = `world_wool_town_g${rawGraph.graph_revision}`;
  const seeds = events.filter(worldSeededEvent);
  if (seeds.length > 1) {
    return { status: "blocked", reason: "WORLD_IDENTITY_MISMATCH" };
  }

  let seeded = false;
  if (seeds.length === 1) {
    const seed = seeds[0]!;
    if (
      events.indexOf(seed) <= events.indexOf(graphCommit) ||
      seed.payload.world_id !== canonicalWorldId ||
      seed.payload.graph_revision !== rawGraph.graph_revision ||
      seed.payload.seed !== WOOL_TOWN_SEED ||
      seed.payload.ruleset_id !== WOOL_TOWN_RULESET_ID
    ) {
      return { status: "blocked", reason: "WORLD_IDENTITY_MISMATCH" };
    }
  } else {
    const version = await input.store.getVersion(experienceId);
    const lastStreamVersion = events[events.length - 1]?.stream_version ?? 0;
    if (!version.ok || version.value !== lastStreamVersion) {
      return { status: "blocked", reason: "STORE_UNAVAILABLE" };
    }
    const draft = await createDomainEventDraftBrowser({
      message_name: "reader_world.world.seeded.v1",
      message_id: input.ids.nextId("msg"),
      experience_id: experienceId,
      correlation_id: input.ids.nextId("corr"),
      causation_id: graphCommit.message_id,
      producer: {
        module: "reader_world",
        instance: "world-bootstrap-t010",
      },
      security: {
        principal_id: LIVE_PRINCIPAL_ID,
        authority: "system",
        integrity: "local",
      },
      recorded_at: input.clock.nowRfc3339(),
      payload: {
        world_id: canonicalWorldId,
        graph_revision: rawGraph.graph_revision,
        seed: WOOL_TOWN_SEED,
        ruleset_id: WOOL_TOWN_RULESET_ID,
      },
    });
    const appended = await input.store.append({
      experience_id: experienceId,
      principal_id: LIVE_PRINCIPAL_ID,
      idempotency_key: `world_seed:${rawGraph.graph_revision}:${accepted.relation_id}`,
      expected_version: version.value || -1,
      events: [draft],
    });
    if (!appended.ok) {
      return { status: "blocked", reason: "STORE_UNAVAILABLE" };
    }
    seeded = !appended.value.duplicate;
  }

  const inspected = await inspectCurrentWorld({
    store: input.store,
    experience_id: experienceId,
  });
  if (
    !inspected.ok ||
    inspected.world_state.phase !== "playable" ||
    inspected.world_state.world_id !== canonicalWorldId ||
    inspected.world_state.graph_revision !== rawGraph.graph_revision ||
    inspected.world_state.seed !== WOOL_TOWN_SEED ||
    inspected.world_state.ruleset_id !== WOOL_TOWN_RULESET_ID
  ) {
    return { status: "blocked", reason: "WORLD_IDENTITY_MISMATCH" };
  }

  const current = input.session;
  if (
    current.state === "active.playable" ||
    current.state === "active.evidence"
  ) {
    if (
      current.context.world_id !== canonicalWorldId ||
      current.context.world_basis_graph_revision !== rawGraph.graph_revision
    ) {
      return { status: "blocked", reason: "WORLD_IDENTITY_MISMATCH" };
    }
    return {
      status: "opened",
      seeded: false,
      world_id: canonicalWorldId,
      world_revision: inspected.world_state.world_revision,
    };
  }
  if (
    current.state !== "active.reading" &&
    current.state !== "active.reviewing_graph"
  ) {
    return { status: "blocked", reason: "SESSION_NOT_READY" };
  }

  if (
    !current.context.playability_passed ||
    current.context.playability_graph_revision !== rawGraph.graph_revision
  ) {
    const playability = current.send({
      type: "PLAYABILITY_PASSED",
      graph_revision: rawGraph.graph_revision,
    });
    if (!playability.accepted) {
      return { status: "blocked", reason: "SESSION_NOT_READY" };
    }
  }
  const opening = current.send({
    type: "WORLD_OPEN_REQUESTED",
    graph_revision: rawGraph.graph_revision,
  });
  const preparation = opening.requested_effects.find(
    (effect): effect is Extract<typeof effect, { kind: "prepare_world" }> =>
      effect.kind === "prepare_world",
  );
  if (
    !opening.accepted ||
    !preparation ||
    preparation.graph_revision !== rawGraph.graph_revision
  ) {
    return { status: "blocked", reason: "SESSION_NOT_READY" };
  }
  const ready = current.send({
    type: "WORLD_READY",
    correlation_id: preparation.correlation_id,
    graph_revision: rawGraph.graph_revision,
    world_id: canonicalWorldId,
    world_revision: inspected.world_state.world_revision,
    effect_generation: preparation.generation,
  });
  if (!ready.accepted) {
    return { status: "blocked", reason: "SESSION_NOT_READY" };
  }

  return {
    status: "opened",
    seeded,
    world_id: canonicalWorldId,
    world_revision: inspected.world_state.world_revision,
  };
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
  voiceSourceSnapshots,
}: {
  children: ReactNode;
  /** Built on server from loadWealthOfNationsBook SourceBlocks (F33). */
  sourceEvidence: SourceEvidenceMap;
  /** Live SourceBlock quote + evidence for T006 discussion. */
  discussionSnapshots: DiscussionSnapshotMap;
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
    useState<CommittedWorldPresentation | null>(null);
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
  const lastWorldBasisRef = useRef<WorldBasis | null>(null);
  const agentTurnChainRef = useRef<Promise<void>>(Promise.resolve());
  const agentTurnGenerationRef = useRef(0);
  const agentTurnCacheRef = useRef<
    Map<string, { fingerprint: string; decision: AgentTurnDecision }>
  >(new Map());
  const graphRef = useRef(graph);
  const sessionRef = useRef(session);
  const worldPresentationGenerationRef = useRef(0);
  const worldBootstrapInFlightRef = useRef(false);

  useEffect(() => {
    boundaryRef.current = boundary;
  }, [boundary]);

  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

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
      const worldDispatch = ports
        ? createWorldDispatchPort({
            store: ports.store,
            principal_id: LIVE_PRINCIPAL_ID,
            draft_factory: (draft) =>
              createDomainEventDraftBrowser({
                ...draft,
                recorded_at: ports.clock.nowRfc3339(),
              }),
          })
        : null;
      const dispatch: AgentTurnDispatchPort | null = worldDispatch
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
            return worldDispatch(request);
          }
        : null;
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
      inspectAgentTurnBasis,
      publishAgentTurnDecision,
      setWorkingPending,
      voiceSourceSnapshots,
    ],
  );

  const submitAgentTurn = useCallback(
    (input: SubmitAgentTurnInput): Promise<AgentTurnDecision> => {
      const control = classifyIntent(input.final_text);
      if (
        control.intent === "explicit_stop" ||
        control.intent === "decline_return"
      ) {
        // Stop/refusal must invalidate an in-flight semantic turn immediately,
        // before it waits behind that turn in the serialized queue.
        agentTurnGenerationRef.current += 1;
      }
      const generation = agentTurnGenerationRef.current;
      const run = async () => executeAgentTurn(input, generation);
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
    worldPresentation,
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
    discussionResolver,
    submitAgentTurn,
    pendingIntent,
    lastAgentTurnDecision,
    committedCommandCount,
    setWorkingPending,
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
