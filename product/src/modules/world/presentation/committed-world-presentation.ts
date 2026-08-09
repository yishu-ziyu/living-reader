/**
 * T010 read-only projection for the InlineWorldBlock.
 * EventStore remains the source of facts; this module accepts no UI or model facts.
 */

import type { SourceDiscussionSnapshot } from "@/modules/agent-os";
import {
  validateStoredDomainEvent,
  type DomainEvent,
} from "@/modules/reader-world/events";
import type {
  ReaderSessionContext,
  SessionStateValue,
} from "@/modules/session";
import {
  CANONICAL_ACTOR_ORDER,
  type ActorId,
} from "../domain/types";
import { canonicalize } from "../domain/canonicalize";
import { compileWorldMetricsToEventMetrics } from "../domain/compile-metrics";
import { createWoolTownBaseline } from "../fixtures/wool-town/baseline";
import { compileReviewedRecipe } from "../recipe";

type CompiledMetrics = Readonly<{
  supply: number;
  inventory: number;
  demand: number;
  cash: number;
}>;

export type CommittedWorldSession = Readonly<{
  state: SessionStateValue;
  context: Pick<
    ReaderSessionContext,
    | "experience_id"
    | "source_snapshot_ids"
    | "source_snapshot_ready"
    | "relation_reviewed"
    | "graph_revision"
    | "graph_committed"
    | "accepted_relation_ids"
    | "playability_passed"
    | "playability_graph_revision"
    | "world_id"
    | "world_revision"
    | "world_basis_graph_revision"
  >;
}>;

export type CommittedWorldPresentationInput = Readonly<{
  /** Complete, ordered raw EventStore stream for session.context.experience_id. */
  events: readonly DomainEvent[];
  /** T002/T006-sealed snapshots; never hand-authored by the InlineWorld UI. */
  sources: readonly SourceDiscussionSnapshot[];
  /** Explicit session gate; events never infer playability. */
  session: CommittedWorldSession;
}>;

export type CommittedWorldEvent = Readonly<{
  message_name: "reader_world.world.event_recorded.v1";
  message_id: string;
  stream_version: number;
  event_index_in_commit: number;
  world_revision: number;
  event_kind: string;
  actor_id: ActorId | null;
  summary: string;
  metrics: CompiledMetrics;
}>;

export type CommittedWorldRole = Readonly<{
  actor_id: ActorId;
  /** Null means the current committed action did not observe this role. */
  observation: CommittedWorldEvent | null;
}>;

export type CommittedWorldSourceBinding = Readonly<{
  source_id: string;
  quote: string;
  fragment: string;
  pdf_page?: number;
  print_page: number;
  edition_id: string;
  edition_revision: string;
  edition_content_hash: string;
  source_content_hash: string;
  evidence_refs: readonly string[];
}>;

export type CommittedWorldRelationBinding = Readonly<{
  relation_id: string;
  from_id: string;
  to_id: string;
  relation_type: string;
  evidence_refs: readonly string[];
  basis_revision: number;
}>;

export type CommittedWorldPresentation = Readonly<{
  basis: Readonly<{
    experience_id: string;
    world_id: string;
    graph_revision: number;
    world_revision: number;
    ruleset_id: string;
    seed: number;
    stream_version: number;
    seeded_stream_version: number;
    graph_committed_stream_version: number;
  }>;
  metrics: CompiledMetrics;
  events: readonly CommittedWorldEvent[];
  roles: readonly CommittedWorldRole[];
  bindings: Readonly<{
    sources: readonly CommittedWorldSourceBinding[];
    relations: readonly CommittedWorldRelationBinding[];
    evidence: Readonly<{
      source_ids: readonly string[];
      evidence_refs: readonly string[];
      event_message_ids: readonly string[];
    }>;
  }>;
  model_extension: Readonly<{
    label: "MODEL EXTENSION";
    ruleset_id: string;
    seed: number;
    graph_revision: number;
  }>;
}>;

type SequencedEvent = Readonly<{ event: DomainEvent; index: number }>;

type CommittedSeed = Readonly<{
  sequenced: SequencedEvent;
  world_id: string;
  graph_revision: number;
  seed: number;
  ruleset_id: string;
  initial_metrics: CompiledMetrics;
}>;

type IdeaRecord = Readonly<{
  event: SequencedEvent;
  idea_id: string;
  source_ids: readonly string[];
  evidence_refs: readonly string[];
}>;

type RelationRecord = Readonly<{
  event: SequencedEvent;
  binding: CommittedWorldRelationBinding;
}>;

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function uniqueStrings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(nonEmptyString) &&
    new Set(value).size === value.length
  );
}

function nonEmptyUniqueStrings(value: unknown): value is string[] {
  return uniqueStrings(value) && value.length > 0;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value) => right.includes(value)) &&
    right.every((value) => left.includes(value))
  );
}

function isSubset(values: readonly string[], allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return values.every((value) => allowedSet.has(value));
}

function appendUnique(target: string[], values: readonly string[]): void {
  for (const value of values) {
    if (!target.includes(value)) target.push(value);
  }
}

function parseCompiledMetrics(raw: unknown): CompiledMetrics | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const metrics = raw as Record<string, unknown>;
  const keys = ["supply", "inventory", "demand", "cash"] as const;
  if (Object.keys(metrics).length !== keys.length) return null;
  if (!keys.every((key) => typeof metrics[key] === "number" && Number.isFinite(metrics[key]))) {
    return null;
  }
  return {
    supply: metrics.supply as number,
    inventory: metrics.inventory as number,
    demand: metrics.demand as number,
    cash: metrics.cash as number,
  };
}

function equalMetrics(left: CompiledMetrics, right: CompiledMetrics): boolean {
  return (
    left.supply === right.supply &&
    left.inventory === right.inventory &&
    left.demand === right.demand &&
    left.cash === right.cash
  );
}

function asActorId(value: unknown): ActorId | null | undefined {
  if (value === null || value === undefined) return null;
  return (CANONICAL_ACTOR_ORDER as readonly string[]).includes(value as string)
    ? (value as ActorId)
    : undefined;
}

function sourceBindings(
  sources: readonly SourceDiscussionSnapshot[],
): Map<string, CommittedWorldSourceBinding> | null {
  const bindings = new Map<string, CommittedWorldSourceBinding>();
  for (const source of sources) {
    if (
      !source ||
      !nonEmptyString(source.source_id) ||
      !nonEmptyString(source.quote) ||
      !nonEmptyString(source.fragment) ||
      (source.pdf_page !== undefined &&
        !positiveSafeInteger(source.pdf_page)) ||
      !positiveSafeInteger(source.print_page) ||
      !nonEmptyString(source.edition_id) ||
      !nonEmptyString(source.edition_revision) ||
      !nonEmptyString(source.edition_content_hash) ||
      !nonEmptyString(source.source_content_hash) ||
      !nonEmptyUniqueStrings(source.evidence_refs) ||
      bindings.has(source.source_id)
    ) {
      return null;
    }
    bindings.set(source.source_id, {
      source_id: source.source_id,
      quote: source.quote,
      fragment: source.fragment,
      ...(source.pdf_page === undefined
        ? {}
        : { pdf_page: source.pdf_page }),
      print_page: source.print_page,
      edition_id: source.edition_id,
      edition_revision: source.edition_revision,
      edition_content_hash: source.edition_content_hash,
      source_content_hash: source.source_content_hash,
      evidence_refs: [...source.evidence_refs],
    });
  }
  return bindings;
}

function gatedContext(input: CommittedWorldPresentationInput):
  | { experience_id: string; graph_revision: number; world_id: string }
  | null {
  const { state, context } = input.session;
  if (state !== "active.playable" && state !== "active.evidence") return null;
  if (
    !nonEmptyString(context.experience_id) ||
    !context.source_snapshot_ready ||
    !nonEmptyUniqueStrings(context.source_snapshot_ids) ||
    !context.relation_reviewed ||
    !context.graph_committed ||
    !nonNegativeSafeInteger(context.graph_revision) ||
    !nonEmptyUniqueStrings(context.accepted_relation_ids) ||
    !context.playability_passed ||
    context.playability_graph_revision !== context.graph_revision ||
    !nonEmptyString(context.world_id) ||
    !nonNegativeSafeInteger(context.world_revision) ||
    context.world_basis_graph_revision !== context.graph_revision
  ) {
    return null;
  }
  return {
    experience_id: context.experience_id,
    graph_revision: context.graph_revision,
    world_id: context.world_id,
  };
}

function normalizedEvents(
  raw: readonly DomainEvent[],
  experience_id: string,
): SequencedEvent[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const messageIds = new Set<string>();
  const events: SequencedEvent[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const checked = validateStoredDomainEvent(raw[index]);
    if (
      !checked.ok ||
      checked.value.experience_id !== experience_id ||
      checked.value.stream_version !== index + 1 ||
      !nonNegativeSafeInteger(checked.value.event_index_in_commit) ||
      messageIds.has(checked.value.message_id)
    ) {
      return null;
    }
    messageIds.add(checked.value.message_id);
    events.push({ event: checked.value, index });
  }
  return events;
}

function readRelationBindings(
  events: readonly SequencedEvent[],
  graphCommit: SequencedEvent,
  accepted_relation_ids: readonly string[],
  sources: Map<string, CommittedWorldSourceBinding>,
  source_snapshot_ids: readonly string[],
): { relations: CommittedWorldRelationBinding[]; source_ids: string[]; evidence_refs: string[] } | null {
  const ideas = new Map<string, IdeaRecord>();
  const proposals = new Map<string, RelationRecord>();
  const reviews = new Map<string, SequencedEvent>();

  for (const sequenced of events) {
    if (sequenced.index >= graphCommit.index) break;
    const { event } = sequenced;
    if (event.message_name === "reader_world.reader_idea.proposed.v1") {
      const payload = event.payload;
      if (
        !nonEmptyString(payload.idea_id) ||
        !nonEmptyUniqueStrings(payload.source_ids) ||
        !nonEmptyUniqueStrings(payload.evidence_refs)
      ) {
        return null;
      }
      ideas.set(payload.idea_id, {
        event: sequenced,
        idea_id: payload.idea_id,
        source_ids: [...payload.source_ids],
        evidence_refs: [...payload.evidence_refs],
      });
    } else if (event.message_name === "reader_world.relation.proposed.v1") {
      const payload = event.payload;
      if (
        !nonEmptyString(payload.relation_id) ||
        !nonEmptyString(payload.from_id) ||
        !nonEmptyString(payload.to_id) ||
        !nonEmptyString(payload.relation_type) ||
        !nonEmptyUniqueStrings(payload.evidence_refs) ||
        !nonNegativeSafeInteger(payload.basis_revision)
      ) {
        return null;
      }
      proposals.set(payload.relation_id, {
        event: sequenced,
        binding: {
          relation_id: payload.relation_id,
          from_id: payload.from_id,
          to_id: payload.to_id,
          relation_type: payload.relation_type,
          evidence_refs: [...payload.evidence_refs],
          basis_revision: payload.basis_revision,
        },
      });
    } else if (event.message_name === "reader_world.relation.reviewed.v1") {
      if (!nonEmptyString(event.payload.relation_id)) return null;
      reviews.set(event.payload.relation_id, sequenced);
    }
  }

  const relations: CommittedWorldRelationBinding[] = [];
  const source_ids: string[] = [];
  const evidence_refs: string[] = [];
  for (const relationId of accepted_relation_ids) {
    const proposal = proposals.get(relationId);
    const review = reviews.get(relationId);
    if (
      !proposal ||
      !review ||
      review.index <= proposal.event.index ||
      review.event.message_name !== "reader_world.relation.reviewed.v1" ||
      review.event.payload.decision !== "accepted" ||
      review.event.payload.basis_revision !== proposal.binding.basis_revision
    ) {
      return null;
    }
    const relatedIdeas = [
      ideas.get(proposal.binding.from_id),
      ideas.get(proposal.binding.to_id),
    ];
    if (
      relatedIdeas.some(
        (idea) => !idea || idea.event.index >= proposal.event.index,
      )
    ) {
      return null;
    }
    const relationSourceRefs: string[] = [];
    for (const idea of relatedIdeas as IdeaRecord[]) {
      const allowedRefs: string[] = [];
      for (const sourceId of idea.source_ids) {
        const source = sources.get(sourceId);
        if (!source || !source_snapshot_ids.includes(sourceId)) return null;
        appendUnique(allowedRefs, source.evidence_refs);
        if (!source_ids.includes(sourceId)) source_ids.push(sourceId);
      }
      if (
        !isSubset(idea.evidence_refs, allowedRefs) ||
        !isSubset(idea.evidence_refs, proposal.binding.evidence_refs)
      ) {
        return null;
      }
      appendUnique(relationSourceRefs, idea.evidence_refs);
    }
    if (!isSubset(proposal.binding.evidence_refs, relationSourceRefs)) {
      return null;
    }
    relations.push(proposal.binding);
    appendUnique(evidence_refs, proposal.binding.evidence_refs);
  }

  return { relations, source_ids, evidence_refs };
}

function readWorldEvents(
  events: readonly SequencedEvent[],
  seed: SequencedEvent,
  world_id: string,
  initial_metrics: CompiledMetrics,
): {
  events: CommittedWorldEvent[];
  metrics: CompiledMetrics;
  world_revision: number;
  stream_version: number;
} | null {
  const records: CommittedWorldEvent[] = [];
  for (const sequenced of events) {
    const { event } = sequenced;
    if (event.message_name !== "reader_world.world.event_recorded.v1") continue;
    if (sequenced.index <= seed.index) return null;
    const payload = event.payload;
    const actor_id = asActorId(payload.actor_id ?? null);
    const metrics = parseCompiledMetrics(payload.metrics);
    if (
      payload.world_id !== world_id ||
      !positiveSafeInteger(payload.world_revision) ||
      !nonEmptyString(payload.event_kind) ||
      !nonEmptyString(payload.summary) ||
      actor_id === undefined ||
      !metrics
    ) {
      return null;
    }
    records.push({
      message_name: "reader_world.world.event_recorded.v1",
      message_id: event.message_id,
      stream_version: event.stream_version,
      event_index_in_commit: event.event_index_in_commit,
      world_revision: payload.world_revision,
      event_kind: payload.event_kind,
      actor_id,
      summary: payload.summary,
      metrics,
    });
  }
  if (records.length === 0) {
    return {
      events: [],
      metrics: initial_metrics,
      world_revision: 0,
      stream_version: seed.event.stream_version,
    };
  }

  let expectedRevision = 1;
  let groupStart = 0;
  while (groupStart < records.length) {
    const groupRevision = records[groupStart]!.world_revision;
    if (groupRevision !== expectedRevision) return null;
    const groupMetrics = records[groupStart]!.metrics;
    let groupLength = 0;
    while (
      groupStart + groupLength < records.length &&
      records[groupStart + groupLength]!.world_revision === groupRevision
    ) {
      const current = records[groupStart + groupLength]!;
      const previous = groupLength === 0 ? null : records[groupStart + groupLength - 1]!;
      if (
        current.event_index_in_commit !== groupLength ||
        !equalMetrics(current.metrics, groupMetrics) ||
        (previous !== null && current.stream_version !== previous.stream_version + 1)
      ) {
        return null;
      }
      groupLength += 1;
    }
    groupStart += groupLength;
    expectedRevision += 1;
  }

  const last = records[records.length - 1]!;
  return {
    events: records,
    metrics: last.metrics,
    world_revision: last.world_revision,
    stream_version: last.stream_version,
  };
}

function readCommittedSeed(seed: SequencedEvent): CommittedSeed | null {
  const { event } = seed;
  if (event.message_name === "reader_world.world.seeded.v1") {
    if (
      !nonEmptyString(event.payload.world_id) ||
      !nonNegativeSafeInteger(event.payload.graph_revision) ||
      !Number.isSafeInteger(event.payload.seed) ||
      !nonEmptyString(event.payload.ruleset_id)
    ) {
      return null;
    }
    const initial = createWoolTownBaseline({
      experience_id: event.experience_id,
      world_id: event.payload.world_id,
      graph_revision: event.payload.graph_revision,
      seed: event.payload.seed,
    });
    if (initial.ruleset_id !== event.payload.ruleset_id) return null;
    return {
      sequenced: seed,
      world_id: event.payload.world_id,
      graph_revision: event.payload.graph_revision,
      seed: event.payload.seed,
      ruleset_id: event.payload.ruleset_id,
      initial_metrics: compileWorldMetricsToEventMetrics(initial.metrics),
    };
  }
  if (event.message_name !== "reader_world.world.seeded.v2") return null;
  const compiled = compileReviewedRecipe({
    recipe_id: event.payload.recipe_id,
    parameters: event.payload.normalized_parameters,
    seed: event.payload.seed,
    experience_id: event.experience_id,
    world_id: event.payload.world_id,
    graph_revision: event.payload.graph_revision,
  });
  if (
    !compiled.ok ||
    compiled.value.recipe_fingerprint !== event.payload.recipe_fingerprint ||
    compiled.value.definition.initial_state.ruleset_id !== event.payload.ruleset_id ||
    canonicalize(compiled.value.normalized_parameters) !==
      canonicalize(event.payload.normalized_parameters)
  ) {
    return null;
  }
  return {
    sequenced: seed,
    world_id: event.payload.world_id,
    graph_revision: event.payload.graph_revision,
    seed: event.payload.seed,
    ruleset_id: event.payload.ruleset_id,
    initial_metrics: compileWorldMetricsToEventMetrics(
      compiled.value.definition.initial_state.metrics,
    ),
  };
}

/**
 * Builds UI-safe world data only when the explicit session gate and raw stream
 * describe the same committed, source-bound world. Any inconsistency is null.
 */
export function buildCommittedWorldPresentation(
  input: CommittedWorldPresentationInput,
): CommittedWorldPresentation | null {
  const gate = gatedContext(input);
  const sources = sourceBindings(input.sources);
  if (!gate || !sources) return null;

  const events = normalizedEvents(input.events, gate.experience_id);
  if (!events) return null;

  const graphCommits = events.filter(
    ({ event }) => event.message_name === "reader_world.graph.committed.v1",
  );
  const seeds = events.filter(
    ({ event }) =>
      event.message_name === "reader_world.world.seeded.v1" ||
      event.message_name === "reader_world.world.seeded.v2",
  );
  if (graphCommits.length === 0 || seeds.length !== 1) return null;

  const graphCommit = graphCommits[graphCommits.length - 1]!;
  const seed = seeds[0]!;
  const committedSeed = readCommittedSeed(seed);
  if (
    !committedSeed ||
    graphCommit.event.message_name !== "reader_world.graph.committed.v1" ||
    graphCommit.index >= seed.index ||
    !nonNegativeSafeInteger(graphCommit.event.payload.graph_revision) ||
    !nonNegativeSafeInteger(graphCommit.event.payload.basis_graph_revision) ||
    !nonEmptyUniqueStrings(graphCommit.event.payload.accepted_relation_ids) ||
    graphCommit.event.payload.graph_revision !== gate.graph_revision ||
    !sameStringSet(
      graphCommit.event.payload.accepted_relation_ids,
      input.session.context.accepted_relation_ids,
    ) ||
    committedSeed.world_id !== gate.world_id ||
    committedSeed.graph_revision !== gate.graph_revision
  ) {
    return null;
  }

  const bindings = readRelationBindings(
    events,
    graphCommit,
    graphCommit.event.payload.accepted_relation_ids,
    sources,
    input.session.context.source_snapshot_ids,
  );
  const world = readWorldEvents(
    events,
    committedSeed.sequenced,
    gate.world_id,
    committedSeed.initial_metrics,
  );
  if (!bindings || !world) return null;

  const latestRevisionEvents = world.events.filter(
    (event) => event.world_revision === world.world_revision,
  );
  const roles = CANONICAL_ACTOR_ORDER.map((actor_id) => {
    const observations = latestRevisionEvents.filter(
      (event) => event.actor_id === actor_id,
    );
    if (observations.length > 1) return null;
    return { actor_id, observation: observations[0] ?? null };
  });
  if (roles.some((role) => role === null)) return null;

  const outputSources: CommittedWorldSourceBinding[] = [];
  for (const sourceId of bindings.source_ids) {
    const source = sources.get(sourceId);
    if (!source) return null;
    outputSources.push(source);
  }
  return {
    basis: {
      experience_id: gate.experience_id,
      world_id: gate.world_id,
      graph_revision: gate.graph_revision,
      world_revision: world.world_revision,
      ruleset_id: committedSeed.ruleset_id,
      seed: committedSeed.seed,
      stream_version: world.stream_version,
      seeded_stream_version: seed.event.stream_version,
      graph_committed_stream_version: graphCommit.event.stream_version,
    },
    metrics: world.metrics,
    events: world.events,
    roles: roles as CommittedWorldRole[],
    bindings: {
      sources: outputSources,
      relations: bindings.relations,
      evidence: {
        source_ids: bindings.source_ids,
        evidence_refs: bindings.evidence_refs,
        event_message_ids: world.events.map((event) => event.message_id),
      },
    },
    model_extension: {
      label: "MODEL EXTENSION",
      ruleset_id: committedSeed.ruleset_id,
      seed: committedSeed.seed,
      graph_revision: gate.graph_revision,
    },
  };
}
