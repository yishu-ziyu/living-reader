import { compileWorldMetricsToEventMetrics } from "../domain/compile-metrics";
import { parseWorldState } from "../domain/parse";
import { deepFreeze } from "../domain/safe";
import {
  validateCausationSequence,
  validateKernelEventSpec,
} from "../domain/validate-spec";
import type { ActorId, KernelEventSpec } from "../domain/types";
import type {
  CompilePresentationInput,
  PresentationPlan,
  PresentationTimelineStep,
} from "./types";
import {
  compileWoolTownWalkPresentation,
  walkDomSummaryLines,
} from "./walk";

function sameMetrics(
  left: ReturnType<typeof compileWorldMetricsToEventMetrics>,
  right: ReturnType<typeof compileWorldMetricsToEventMetrics>,
): boolean {
  return (
    left.supply === right.supply &&
    left.inventory === right.inventory &&
    left.demand === right.demand &&
    left.cash === right.cash
  );
}

function identityMatches(input: CompilePresentationInput): boolean {
  const { definition, state } = input;
  const initial = definition.initial_state;
  return (
    definition.definition_version === 1 &&
    definition.recipe_id.length > 0 &&
    definition.recipe_fingerprint.length > 0 &&
    state.experience_id === initial.experience_id &&
    state.world_id === initial.world_id &&
    state.graph_revision === initial.graph_revision &&
    state.ruleset_id === initial.ruleset_id &&
    state.seed === initial.seed &&
    definition.seed === initial.seed &&
    definition.ruleset.ruleset_id === initial.ruleset_id
  );
}

function parsedEvents(
  input: CompilePresentationInput,
): KernelEventSpec[] | null {
  const events: KernelEventSpec[] = [];
  const actorIds = new Set(input.definition.actors.map((actor) => actor.actor_id));
  const compiledStateMetrics = compileWorldMetricsToEventMetrics(input.state.metrics);
  for (const raw of input.events) {
    const parsed = validateKernelEventSpec(raw);
    if (
      !parsed.ok ||
      parsed.value.actor_id === null ||
      !actorIds.has(parsed.value.actor_id) ||
      !sameMetrics(parsed.value.metrics, compiledStateMetrics)
    ) {
      return null;
    }
    events.push(parsed.value);
  }
  if (!validateCausationSequence(events)) return null;
  if (
    (events.length === 0 && input.state.world_revision !== 0) ||
    (events.length > 0 && input.state.world_revision < 1)
  ) {
    return null;
  }
  return events;
}

/** Pure renderer-independent mapping. It never reads DOM, time, or randomness. */
export function compilePresentation(
  input: CompilePresentationInput,
): PresentationPlan | null {
  const state = parseWorldState(input.state);
  if (!state.ok || !identityMatches(input)) return null;
  const events = parsedEvents(input);
  if (!events) return null;

  const actors = new Map(
    input.definition.actors.map((actor) => [actor.actor_id, actor]),
  );
  const entities = input.definition.visual_grammar.entity_order.map(
    (actor_id, position) => {
      const actor = actors.get(actor_id);
      return actor
        ? { actor_id, label: actor.label, role: actor.role, position }
        : null;
    },
  );
  if (entities.some((entity) => entity === null)) return null;

  const timeline: PresentationTimelineStep[] = events.map((event, index) => ({
    index,
    actor_id: event.actor_id as ActorId,
    event_kind: event.event_kind,
    motion_verb: input.definition.visual_grammar.motion_verbs[event.event_kind],
    delay_ms: input.reduced_motion ? 0 : index * 180,
    duration_ms: input.reduced_motion ? 0 : 420,
    caption: event.summary,
  }));
  const metrics = compileWorldMetricsToEventMetrics(state.value.metrics);
  const captions = [
    input.definition.visual_grammar.seed_caption,
    ...events.map((event) => event.summary),
  ];
  const walk =
    input.definition.visual_grammar.scene_template === "wool-workshop"
      ? compileWoolTownWalkPresentation()
      : null;
  const latestEvent = events.at(-1)?.summary ?? null;
  const domSummary = [
    input.definition.visual_grammar.seed_caption,
    `当前状态：产出 ${metrics.supply}，库存 ${metrics.inventory}，可触达订单 ${metrics.demand}，现金 ${metrics.cash}。`,
    ...events.map((event) => event.summary),
    ...(walk ? walkDomSummaryLines(walk, latestEvent) : []),
  ];

  return deepFreeze({
    plan_version: 1,
    motion_mode: input.reduced_motion ? "reduced" : "standard",
    basis: {
      recipe_id: input.definition.recipe_id,
      recipe_fingerprint: input.definition.recipe_fingerprint,
      world_id: state.value.world_id,
      graph_revision: state.value.graph_revision,
      world_revision: state.value.world_revision,
      ruleset_id: state.value.ruleset_id,
      seed: state.value.seed,
    },
    scene: {
      template_id: input.definition.visual_grammar.scene_template,
      title: input.definition.mechanism_title,
      summary: input.definition.mechanism_summary,
    },
    entities: entities as Exclude<(typeof entities)[number], null>[],
    stocks: [...input.definition.stocks],
    flows: [...input.definition.flows],
    actions: input.definition.actions.map((action) => ({
      action_id: action.action_id,
      label: action.label,
      description: action.description,
    })),
    source: {
      book_id: input.definition.source_locator.book_id,
      source_id: input.definition.source_locator.source_id,
      legacy_source_id: input.definition.source_locator.legacy_source_id,
      fragment: input.definition.source_locator.fragment,
      quote: input.definition.source_quote,
    },
    metrics,
    timeline,
    audio_refs: [...input.definition.visual_grammar.audio_refs],
    captions,
    dom_summary: domSummary,
    walk,
  });
}
