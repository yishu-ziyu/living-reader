/**
 * World module — T008 pure WorldKernel public boundary.
 * Client-safe: no node:crypto, no test harness, no EventStore writes.
 * checkGuards is intentionally NOT exported (internal only).
 */
import type { WorldSlotState } from "@/contracts";

export type WorldSlotPlaceholder = {
  state: WorldSlotState;
  label: string;
};

export const CLOSED_WORLD_SLOT: WorldSlotPlaceholder = {
  state: "closed",
  label: "世界槽已闭合 · 等待关系与可玩性门禁（后续任务）",
};

export type {
  ActorId,
  ActorLocalState,
  CharacterObservation,
  CompiledWorldEventMetrics,
  DecisionCode,
  EvolveResult,
  KernelEnv,
  KernelEventKind,
  KernelEventSpec,
  MerchantLocalState,
  ShepherdLocalState,
  SpinnerLocalState,
  WeaverLocalState,
  WorldActionId,
  WorldCommand,
  WorldDecisionReceipt,
  WorldIdentity,
  WorldMetrics,
  WorldPhase,
  WorldState,
  WoolTownRuleset,
} from "./domain/types";

export { CANONICAL_ACTOR_ORDER } from "./domain/types";

export {
  canonicalize,
  cloneWorldState,
  cloneMetrics,
  deepEqualState,
  metricsEqual,
  validateKernelEventSpec,
  validateObservation,
  validateCausationSequence,
  compileWorldMetricsToEventMetrics,
  KERNEL_COMPILED_METRIC_KEYS,
  parseWorldState,
  parseWorldCommand,
  parseKernelEnv,
  EMPTY_WORLD_STATE,
  FROZEN_WOOL_TOWN_RULESET,
  resolveCanonicalRuleset,
} from "./domain";

export { decide, evolve } from "./kernel";

export {
  selectLocalState,
  recomputePredicate,
  weaverDeepenPredicate,
  merchantExpandPredicate,
  shepherdExpandPredicate,
  spinnerExpandPredicate,
  weaverExpandPredicate,
} from "./actors";

export {
  WOOL_TOWN_RULESET_ID,
  WOOL_TOWN_BASELINE_METRICS,
  WOOL_TOWN_EXPANDED_METRICS,
  WOOL_TOWN_RULESET,
  createWoolTownBaseline,
  woolTownEnv,
} from "./fixtures/wool-town";

export {
  assertWalkOccupancy,
  buildCommittedWorldPresentation,
  type CommittedWorldEvent,
  type CommittedWorldPresentation,
  type CommittedWorldPresentationInput,
  type CommittedWorldRelationBinding,
  type CommittedWorldRole,
  type CommittedWorldSession,
  type CommittedWorldSourceBinding,
  chebyshevDistance,
  compilePresentation,
  compileWoolTownWalkPresentation,
  isWalkableCell,
  lockedPlacesHaveReasons,
  type CompilePresentationInput,
  type PresentationAction,
  type PresentationEntity,
  type PresentationFlow,
  type PresentationPlan,
  type PresentationSource,
  type PresentationStock,
  type PresentationTimelineStep,
  resolveCurrentPlaceId,
  resolveWalkSprite,
  sortDrawablesByDepth,
  WALK_SPRITE,
  WALK_SPRITE_DIR,
  type WalkCell,
  type WalkDrawable,
  type WalkDrawableKind,
  type WalkPlace,
  type WalkPlaceStatus,
  type WalkPresentation,
  walkDomSummaryLines,
} from "./presentation";

export {
  compileReviewedRecipe,
  getReviewedRecipe,
  listReviewedRecipeIdsForSource,
  listReviewedRecipes,
  parseWorldRecipe,
  recipeFingerprint,
  type CompileReviewedRecipeInput,
  type CompileReviewedRecipeResult,
  type NormalizedRecipeParameters,
  type RecipeCompileCode,
  type RecipeParseResult,
  type RecipeSourceLocator,
  type RecipeVisualGrammar,
  type WorldDefinition,
  type WorldRecipe,
} from "./recipe";
