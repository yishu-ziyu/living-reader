import { FROZEN_WOOL_TOWN_RULESET } from "../domain/frozen-ruleset";
import {
  isFiniteNumber,
  isPlainObject,
  isSafeInteger,
} from "../domain/safe";
import { deepFreeze } from "../domain/safe";
import {
  CANONICAL_ACTOR_ORDER,
  type ActorId,
  type KernelEventKind,
  type WorldActionId,
  type WorldMetrics,
} from "../domain/types";
import type {
  RecipeAction,
  RecipeActor,
  RecipeFailureMode,
  RecipeFlow,
  RecipeMetric,
  RecipeMetricId,
  RecipeParameter,
  RecipeParameterTarget,
  RecipeParseResult,
  RecipePredicate,
  RecipeSourceLocator,
  RecipeStateTransition,
  RecipeStock,
  RecipeVisualGrammar,
  WorldRecipe,
} from "./types";

const ROOT_KEYS = [
  "recipe_id",
  "source_locator",
  "source_quote",
  "claim_type",
  "mechanism",
  "actors",
  "stocks",
  "flows",
  "actions",
  "predicates",
  "metrics",
  "state_transitions",
  "failure_modes",
  "visual_grammar",
  "parameters",
  "reuse_examples",
  "status",
] as const;

const ACTORS = new Set<string>(CANONICAL_ACTOR_ORDER);
const ACTIONS = new Set<string>(["deepen_specialization", "expand_market"]);
const METRICS = ["output", "stock", "reachable_orders", "cash"] as const;
const METRIC_SET = new Set<string>(METRICS);
const EVENT_KINDS = [
  "character_refusal",
  "character_accept",
  "character_observation",
] as const;
const EVENT_KIND_SET = new Set<string>(EVENT_KINDS);

type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };

function pass<T>(value: T): Parsed<T> {
  return { ok: true, value };
}

function reject<T = never>(reason: string): Parsed<T> {
  return { ok: false, reason };
}

function exactObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Parsed<Record<string, unknown>> {
  if (!isPlainObject(value)) return reject(`${label} must be a plain object`);
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) return reject(`${label} has unknown field: ${key}`);
  }
  for (const key of keys) {
    if (!(key in value)) return reject(`${label} missing field: ${key}`);
  }
  return pass(value);
}

function stringValue(value: unknown, label: string): Parsed<string> {
  return typeof value === "string" && value.trim().length > 0
    ? pass(value)
    : reject(`${label} must be a non-empty string`);
}

function uniqueStringArray(value: unknown, label: string): Parsed<string[]> {
  if (!Array.isArray(value) || !value.every((item) => stringValue(item, label).ok)) {
    return reject(`${label} must be an array of non-empty strings`);
  }
  if (new Set(value).size !== value.length) {
    return reject(`${label} must not contain duplicates`);
  }
  return pass([...value]);
}

function parseArray<T>(
  value: unknown,
  label: string,
  parser: (item: unknown, index: number) => Parsed<T>,
): Parsed<T[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return reject(`${label} must be a non-empty array`);
  }
  const parsed: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = parser(value[index], index);
    if (!item.ok) return item;
    parsed.push(item.value);
  }
  return pass(parsed);
}

function parseSourceLocator(value: unknown): Parsed<RecipeSourceLocator> {
  const object = exactObject(
    value,
    [
      "book_id",
      "book_part",
      "chapter",
      "source_id",
      "legacy_source_id",
      "fragment",
    ],
    "source_locator",
  );
  if (!object.ok) return object;
  const bookId = stringValue(object.value.book_id, "source_locator.book_id");
  const sourceId = stringValue(object.value.source_id, "source_locator.source_id");
  const legacy = stringValue(
    object.value.legacy_source_id,
    "source_locator.legacy_source_id",
  );
  const fragment = stringValue(object.value.fragment, "source_locator.fragment");
  if (!bookId.ok) return bookId;
  if (!sourceId.ok) return sourceId;
  if (!legacy.ok) return legacy;
  if (!fragment.ok) return fragment;
  if (!isSafeInteger(object.value.book_part) || object.value.book_part < 1) {
    return reject("source_locator.book_part must be a positive safe integer");
  }
  if (!isSafeInteger(object.value.chapter) || object.value.chapter < 1) {
    return reject("source_locator.chapter must be a positive safe integer");
  }
  return pass({
    book_id: bookId.value,
    book_part: object.value.book_part,
    chapter: object.value.chapter,
    source_id: sourceId.value,
    legacy_source_id: legacy.value,
    fragment: fragment.value,
  });
}

function parseMetrics(value: unknown, label: string): Parsed<WorldMetrics> {
  const object = exactObject(value, METRICS, label);
  if (!object.ok) return object;
  for (const metric of METRICS) {
    if (!isFiniteNumber(object.value[metric]) || object.value[metric] < 0) {
      return reject(`${label}.${metric} must be a non-negative finite number`);
    }
  }
  return pass({
    output: object.value.output as number,
    stock: object.value.stock as number,
    reachable_orders: object.value.reachable_orders as number,
    cash: object.value.cash as number,
  });
}

function parseMechanism(value: unknown) {
  const object = exactObject(
    value,
    ["mechanism_id", "title", "summary", "ruleset_id", "initial_metrics"],
    "mechanism",
  );
  if (!object.ok) return object;
  const mechanismId = stringValue(object.value.mechanism_id, "mechanism.mechanism_id");
  const title = stringValue(object.value.title, "mechanism.title");
  const summary = stringValue(object.value.summary, "mechanism.summary");
  const rulesetId = stringValue(object.value.ruleset_id, "mechanism.ruleset_id");
  const metrics = parseMetrics(object.value.initial_metrics, "mechanism.initial_metrics");
  if (!mechanismId.ok) return mechanismId;
  if (!title.ok) return title;
  if (!summary.ok) return summary;
  if (!rulesetId.ok) return rulesetId;
  if (!metrics.ok) return metrics;
  if (rulesetId.value !== FROZEN_WOOL_TOWN_RULESET.ruleset_id) {
    return reject("mechanism.ruleset_id is not supported by WorldKernel");
  }
  return pass({
    mechanism_id: mechanismId.value,
    title: title.value,
    summary: summary.value,
    ruleset_id: rulesetId.value,
    initial_metrics: metrics.value,
  });
}

function parseActor(value: unknown, index: number): Parsed<RecipeActor> {
  const object = exactObject(value, ["actor_id", "label", "role"], `actors[${index}]`);
  if (!object.ok) return object;
  if (typeof object.value.actor_id !== "string" || !ACTORS.has(object.value.actor_id)) {
    return reject(`actors[${index}].actor_id is not allowlisted`);
  }
  const label = stringValue(object.value.label, `actors[${index}].label`);
  const role = stringValue(object.value.role, `actors[${index}].role`);
  if (!label.ok) return label;
  if (!role.ok) return role;
  return pass({ actor_id: object.value.actor_id as ActorId, label: label.value, role: role.value });
}

function parseStock(value: unknown, index: number): Parsed<RecipeStock> {
  const object = exactObject(value, ["id", "label", "metric_id"], `stocks[${index}]`);
  if (!object.ok) return object;
  const id = stringValue(object.value.id, `stocks[${index}].id`);
  const label = stringValue(object.value.label, `stocks[${index}].label`);
  if (!id.ok) return id;
  if (!label.ok) return label;
  if (typeof object.value.metric_id !== "string" || !METRIC_SET.has(object.value.metric_id)) {
    return reject(`stocks[${index}].metric_id is not allowlisted`);
  }
  return pass({ id: id.value, label: label.value, metric_id: object.value.metric_id as RecipeMetricId });
}

function parseFlow(value: unknown, index: number): Parsed<RecipeFlow> {
  const object = exactObject(value, ["id", "label", "from", "to"], `flows[${index}]`);
  if (!object.ok) return object;
  const id = stringValue(object.value.id, `flows[${index}].id`);
  const label = stringValue(object.value.label, `flows[${index}].label`);
  const from = stringValue(object.value.from, `flows[${index}].from`);
  const to = stringValue(object.value.to, `flows[${index}].to`);
  if (!id.ok) return id;
  if (!label.ok) return label;
  if (!from.ok) return from;
  if (!to.ok) return to;
  return pass({ id: id.value, label: label.value, from: from.value, to: to.value });
}

function parseAction(value: unknown, index: number): Parsed<RecipeAction> {
  const object = exactObject(value, ["action_id", "label", "description"], `actions[${index}]`);
  if (!object.ok) return object;
  if (typeof object.value.action_id !== "string" || !ACTIONS.has(object.value.action_id)) {
    return reject(`actions[${index}].action_id is not allowlisted`);
  }
  const label = stringValue(object.value.label, `actions[${index}].label`);
  const description = stringValue(object.value.description, `actions[${index}].description`);
  if (!label.ok) return label;
  if (!description.ok) return description;
  return pass({
    action_id: object.value.action_id as WorldActionId,
    label: label.value,
    description: description.value,
  });
}

function parsePredicate(value: unknown, index: number): Parsed<RecipePredicate> {
  const object = exactObject(
    value,
    ["predicate_id", "actor_id", "description"],
    `predicates[${index}]`,
  );
  if (!object.ok) return object;
  const id = stringValue(object.value.predicate_id, `predicates[${index}].predicate_id`);
  const description = stringValue(object.value.description, `predicates[${index}].description`);
  if (!id.ok) return id;
  if (!description.ok) return description;
  if (typeof object.value.actor_id !== "string" || !ACTORS.has(object.value.actor_id)) {
    return reject(`predicates[${index}].actor_id is not allowlisted`);
  }
  return pass({
    predicate_id: id.value,
    actor_id: object.value.actor_id as ActorId,
    description: description.value,
  });
}

function parseMetric(value: unknown, index: number): Parsed<RecipeMetric> {
  const object = exactObject(value, ["metric_id", "label", "unit"], `metrics[${index}]`);
  if (!object.ok) return object;
  if (typeof object.value.metric_id !== "string" || !METRIC_SET.has(object.value.metric_id)) {
    return reject(`metrics[${index}].metric_id is not allowlisted`);
  }
  const label = stringValue(object.value.label, `metrics[${index}].label`);
  const unit = stringValue(object.value.unit, `metrics[${index}].unit`);
  if (!label.ok) return label;
  if (!unit.ok) return unit;
  return pass({ metric_id: object.value.metric_id as RecipeMetricId, label: label.value, unit: unit.value });
}

function parseTransition(value: unknown, index: number): Parsed<RecipeStateTransition> {
  const object = exactObject(
    value,
    ["action_id", "event_kinds", "description"],
    `state_transitions[${index}]`,
  );
  if (!object.ok) return object;
  if (typeof object.value.action_id !== "string" || !ACTIONS.has(object.value.action_id)) {
    return reject(`state_transitions[${index}].action_id is not allowlisted`);
  }
  const kinds = uniqueStringArray(object.value.event_kinds, `state_transitions[${index}].event_kinds`);
  const description = stringValue(object.value.description, `state_transitions[${index}].description`);
  if (!kinds.ok) return kinds;
  if (!kinds.value.every((kind) => EVENT_KIND_SET.has(kind))) {
    return reject(`state_transitions[${index}].event_kinds is not allowlisted`);
  }
  if (!description.ok) return description;
  return pass({
    action_id: object.value.action_id as WorldActionId,
    event_kinds: kinds.value as KernelEventKind[],
    description: description.value,
  });
}

function parseFailure(value: unknown, index: number): Parsed<RecipeFailureMode> {
  const object = exactObject(
    value,
    ["id", "condition", "visible_result"],
    `failure_modes[${index}]`,
  );
  if (!object.ok) return object;
  const id = stringValue(object.value.id, `failure_modes[${index}].id`);
  const condition = stringValue(object.value.condition, `failure_modes[${index}].condition`);
  const visible = stringValue(object.value.visible_result, `failure_modes[${index}].visible_result`);
  if (!id.ok) return id;
  if (!condition.ok) return condition;
  if (!visible.ok) return visible;
  return pass({ id: id.value, condition: condition.value, visible_result: visible.value });
}

function parseVisualGrammar(value: unknown): Parsed<RecipeVisualGrammar> {
  const object = exactObject(
    value,
    ["scene_template", "entity_order", "motion_verbs", "audio_refs", "seed_caption"],
    "visual_grammar",
  );
  if (!object.ok) return object;
  const template = stringValue(object.value.scene_template, "visual_grammar.scene_template");
  const order = uniqueStringArray(object.value.entity_order, "visual_grammar.entity_order");
  const audio = Array.isArray(object.value.audio_refs) && object.value.audio_refs.length === 0
    ? pass<string[]>([])
    : uniqueStringArray(object.value.audio_refs, "visual_grammar.audio_refs");
  const caption = stringValue(object.value.seed_caption, "visual_grammar.seed_caption");
  const motions = exactObject(object.value.motion_verbs, EVENT_KINDS, "visual_grammar.motion_verbs");
  if (!template.ok) return template;
  if (!order.ok) return order;
  if (!audio.ok) return audio;
  if (!caption.ok) return caption;
  if (!motions.ok) return motions;
  if (
    order.value.length !== CANONICAL_ACTOR_ORDER.length ||
    !order.value.every((actor, index) => actor === CANONICAL_ACTOR_ORDER[index])
  ) {
    return reject("visual_grammar.entity_order must use canonical actor order");
  }
  const motionValues = {} as Record<KernelEventKind, string>;
  for (const kind of EVENT_KINDS) {
    const parsed = stringValue(motions.value[kind], `visual_grammar.motion_verbs.${kind}`);
    if (!parsed.ok) return parsed;
    motionValues[kind] = parsed.value;
  }
  return pass({
    scene_template: template.value,
    entity_order: order.value as ActorId[],
    motion_verbs: motionValues,
    audio_refs: audio.value,
    seed_caption: caption.value,
  });
}

function parseParameter(value: unknown, index: number): Parsed<RecipeParameter> {
  const object = exactObject(
    value,
    ["id", "label", "min", "max", "default", "integer", "target"],
    `parameters[${index}]`,
  );
  if (!object.ok) return object;
  const id = stringValue(object.value.id, `parameters[${index}].id`);
  const label = stringValue(object.value.label, `parameters[${index}].label`);
  if (!id.ok) return id;
  if (!label.ok) return label;
  if (
    !isFiniteNumber(object.value.min) ||
    !isFiniteNumber(object.value.max) ||
    !isFiniteNumber(object.value.default) ||
    object.value.min > object.value.default ||
    object.value.default > object.value.max
  ) {
    return reject(`parameters[${index}] range/default is invalid`);
  }
  if (typeof object.value.integer !== "boolean") {
    return reject(`parameters[${index}].integer must be boolean`);
  }
  if (
    object.value.integer &&
    ![object.value.min, object.value.max, object.value.default].every(Number.isSafeInteger)
  ) {
    return reject(`parameters[${index}] integer bounds must be safe integers`);
  }
  if (
    typeof object.value.target !== "string" ||
    !object.value.target.startsWith("metrics.") ||
    !METRIC_SET.has(object.value.target.slice("metrics.".length))
  ) {
    return reject(`parameters[${index}].target is not allowlisted`);
  }
  return pass({
    id: id.value,
    label: label.value,
    min: object.value.min,
    max: object.value.max,
    default: object.value.default,
    integer: object.value.integer,
    target: object.value.target as RecipeParameterTarget,
  });
}

function uniqueBy<T>(items: readonly T[], key: (item: T) => string, label: string): Parsed<T[]> {
  const keys = items.map(key);
  return new Set(keys).size === keys.length ? pass([...items]) : reject(`${label} must be unique`);
}

function exactSet(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && expected.every((value) => actual.includes(value));
}

export function parseWorldRecipe(raw: unknown): RecipeParseResult {
  try {
    const root = exactObject(raw, ROOT_KEYS, "recipe");
    if (!root.ok) return { ok: false, code: "INVALID_RECIPE", reason: root.reason };
    const recipeId = stringValue(root.value.recipe_id, "recipe_id");
    const locator = parseSourceLocator(root.value.source_locator);
    const quote = stringValue(root.value.source_quote, "source_quote");
    const mechanism = parseMechanism(root.value.mechanism);
    const actors = parseArray(root.value.actors, "actors", parseActor);
    const stocks = parseArray(root.value.stocks, "stocks", parseStock);
    const flows = parseArray(root.value.flows, "flows", parseFlow);
    const actions = parseArray(root.value.actions, "actions", parseAction);
    const predicates = parseArray(root.value.predicates, "predicates", parsePredicate);
    const metrics = parseArray(root.value.metrics, "metrics", parseMetric);
    const transitions = parseArray(root.value.state_transitions, "state_transitions", parseTransition);
    const failures = parseArray(root.value.failure_modes, "failure_modes", parseFailure);
    const visual = parseVisualGrammar(root.value.visual_grammar);
    const parameters = parseArray(root.value.parameters, "parameters", parseParameter);
    const examples = uniqueStringArray(root.value.reuse_examples, "reuse_examples");
    const parsed = [recipeId, locator, quote, mechanism, actors, stocks, flows, actions, predicates, metrics, transitions, failures, visual, parameters, examples];
    const failed = parsed.find((result) => !result.ok);
    if (failed && !failed.ok) return { ok: false, code: "INVALID_RECIPE", reason: failed.reason };
    if (root.value.claim_type !== "mechanism" && root.value.claim_type !== "constraint") {
      return { ok: false, code: "INVALID_RECIPE", reason: "claim_type is invalid" };
    }
    if (root.value.status !== "draft" && root.value.status !== "reviewed") {
      return { ok: false, code: "INVALID_RECIPE", reason: "status is invalid" };
    }
    if (!actors.ok || !actions.ok || !metrics.ok || !transitions.ok || !parameters.ok) {
      return { ok: false, code: "INVALID_RECIPE", reason: "recipe arrays are invalid" };
    }
    const uniqueChecks = [
      uniqueBy(actors.value, (item) => item.actor_id, "actors.actor_id"),
      uniqueBy(actions.value, (item) => item.action_id, "actions.action_id"),
      uniqueBy(metrics.value, (item) => item.metric_id, "metrics.metric_id"),
      uniqueBy(parameters.value, (item) => item.id, "parameters.id"),
      uniqueBy(parameters.value, (item) => item.target, "parameters.target"),
    ];
    const duplicate = uniqueChecks.find((result) => !result.ok);
    if (duplicate && !duplicate.ok) {
      return { ok: false, code: "INVALID_RECIPE", reason: duplicate.reason };
    }
    if (!exactSet(actors.value.map((item) => item.actor_id), CANONICAL_ACTOR_ORDER)) {
      return { ok: false, code: "INVALID_RECIPE", reason: "actors must cover canonical WorldKernel actors" };
    }
    if (!exactSet(metrics.value.map((item) => item.metric_id), METRICS)) {
      return { ok: false, code: "INVALID_RECIPE", reason: "metrics must cover WorldKernel metrics" };
    }
    if (!transitions.value.every((item) => actions.value.some((action) => action.action_id === item.action_id))) {
      return { ok: false, code: "INVALID_RECIPE", reason: "state transition action is not declared" };
    }
    if (!recipeId.ok || !locator.ok || !quote.ok || !mechanism.ok || !stocks.ok || !flows.ok || !predicates.ok || !failures.ok || !visual.ok || !examples.ok) {
      return { ok: false, code: "INVALID_RECIPE", reason: "recipe fields are invalid" };
    }
    const recipe: WorldRecipe = {
      recipe_id: recipeId.value,
      source_locator: locator.value,
      source_quote: quote.value,
      claim_type: root.value.claim_type,
      mechanism: mechanism.value,
      actors: actors.value,
      stocks: stocks.value,
      flows: flows.value,
      actions: actions.value,
      predicates: predicates.value,
      metrics: metrics.value,
      state_transitions: transitions.value,
      failure_modes: failures.value,
      visual_grammar: visual.value,
      parameters: parameters.value,
      reuse_examples: examples.value,
      status: root.value.status,
    };
    return { ok: true, value: deepFreeze(recipe) };
  } catch {
    return { ok: false, code: "INVALID_RECIPE", reason: "recipe parser failed" };
  }
}
