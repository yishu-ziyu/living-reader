import type {
  ActorId,
  KernelEventKind,
  WorldActionId,
  WorldMetrics,
  WorldState,
  WoolTownRuleset,
} from "../domain/types";

export type RecipeStatus = "draft" | "reviewed";
export type RecipeClaimType = "mechanism" | "constraint";
export type RecipeMetricId = keyof WorldMetrics;
export type RecipeParameterTarget = `metrics.${RecipeMetricId}`;

export type RecipeSourceLocator = Readonly<{
  book_id: string;
  book_part: number;
  chapter: number;
  source_id: string;
  legacy_source_id: string;
  fragment: string;
}>;

export type RecipeMechanism = Readonly<{
  mechanism_id: string;
  title: string;
  summary: string;
  ruleset_id: string;
  initial_metrics: WorldMetrics;
}>;

export type RecipeActor = Readonly<{
  actor_id: ActorId;
  label: string;
  role: string;
}>;

export type RecipeStock = Readonly<{
  id: string;
  label: string;
  metric_id: RecipeMetricId;
}>;

export type RecipeFlow = Readonly<{
  id: string;
  label: string;
  from: string;
  to: string;
}>;

export type RecipeAction = Readonly<{
  action_id: WorldActionId;
  label: string;
  description: string;
}>;

export type RecipePredicate = Readonly<{
  predicate_id: string;
  actor_id: ActorId;
  description: string;
}>;

export type RecipeMetric = Readonly<{
  metric_id: RecipeMetricId;
  label: string;
  unit: string;
}>;

export type RecipeStateTransition = Readonly<{
  action_id: WorldActionId;
  event_kinds: readonly KernelEventKind[];
  description: string;
}>;

export type RecipeFailureMode = Readonly<{
  id: string;
  condition: string;
  visible_result: string;
}>;

export type RecipeVisualGrammar = Readonly<{
  scene_template: string;
  entity_order: readonly ActorId[];
  motion_verbs: Readonly<Record<KernelEventKind, string>>;
  audio_refs: readonly string[];
  seed_caption: string;
}>;

export type RecipeParameter = Readonly<{
  id: string;
  label: string;
  min: number;
  max: number;
  default: number;
  integer: boolean;
  target: RecipeParameterTarget;
}>;

/** ADR-37's sixteen content fields plus the review lifecycle field. */
export type WorldRecipe = Readonly<{
  recipe_id: string;
  source_locator: RecipeSourceLocator;
  source_quote: string;
  claim_type: RecipeClaimType;
  mechanism: RecipeMechanism;
  actors: readonly RecipeActor[];
  stocks: readonly RecipeStock[];
  flows: readonly RecipeFlow[];
  actions: readonly RecipeAction[];
  predicates: readonly RecipePredicate[];
  metrics: readonly RecipeMetric[];
  state_transitions: readonly RecipeStateTransition[];
  failure_modes: readonly RecipeFailureMode[];
  visual_grammar: RecipeVisualGrammar;
  parameters: readonly RecipeParameter[];
  reuse_examples: readonly string[];
  status: RecipeStatus;
}>;

export type RecipeParseResult =
  | { ok: true; value: WorldRecipe }
  | { ok: false; code: "INVALID_RECIPE"; reason: string };

export type NormalizedRecipeParameters = Readonly<Record<string, number>>;

export type WorldDefinition = Readonly<{
  definition_version: 1;
  recipe_id: string;
  recipe_fingerprint: string;
  normalized_parameters: NormalizedRecipeParameters;
  seed: number;
  source_locator: RecipeSourceLocator;
  source_quote: string;
  claim_type: RecipeClaimType;
  mechanism_id: string;
  ruleset: WoolTownRuleset;
  initial_state: WorldState;
  action_ids: readonly WorldActionId[];
  actors: readonly RecipeActor[];
  metrics: readonly RecipeMetric[];
  visual_grammar: RecipeVisualGrammar;
}>;

export type RecipeCompileCode =
  | "RECIPE_NOT_REVIEWED"
  | "INVALID_IDENTITY"
  | "INVALID_PARAMETERS"
  | "UNKNOWN_PARAMETER";

export type CompileReviewedRecipeInput = Readonly<{
  recipe_id: string;
  parameters?: Readonly<Record<string, unknown>>;
  seed: number;
  experience_id: string;
  world_id: string;
  graph_revision: number;
}>;

export type CompileReviewedRecipeResult =
  | {
      ok: true;
      value: Readonly<{
        definition: WorldDefinition;
        recipe_fingerprint: string;
        normalized_parameters: NormalizedRecipeParameters;
      }>;
    }
  | { ok: false; code: RecipeCompileCode };
