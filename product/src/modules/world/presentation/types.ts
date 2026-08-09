import type {
  ActorId,
  CompiledWorldEventMetrics,
  KernelEventKind,
  WorldState,
} from "../domain/types";
import type { WorldDefinition } from "../recipe";

export type PresentationEntity = Readonly<{
  actor_id: ActorId;
  label: string;
  role: string;
  position: number;
}>;

export type PresentationStock = Readonly<{
  id: string;
  label: string;
  metric_id: keyof WorldState["metrics"];
}>;

export type PresentationFlow = Readonly<{
  id: string;
  label: string;
  from: string;
  to: string;
}>;

export type PresentationAction = Readonly<{
  action_id: string;
  label: string;
  description: string;
}>;

export type PresentationSource = Readonly<{
  book_id: string;
  source_id: string;
  legacy_source_id: string;
  fragment: string;
  quote: string;
}>;

export type PresentationTimelineStep = Readonly<{
  index: number;
  actor_id: ActorId;
  event_kind: KernelEventKind;
  motion_verb: string;
  delay_ms: number;
  duration_ms: number;
  caption: string;
}>;

export type PresentationPlan = Readonly<{
  plan_version: 1;
  motion_mode: "standard" | "reduced";
  basis: Readonly<{
    recipe_id: string;
    recipe_fingerprint: string;
    world_id: string;
    graph_revision: number;
    world_revision: number;
    ruleset_id: string;
    seed: number;
  }>;
  scene: Readonly<{
    template_id: string;
    title: string;
    summary: string;
  }>;
  entities: readonly PresentationEntity[];
  stocks: readonly PresentationStock[];
  flows: readonly PresentationFlow[];
  actions: readonly PresentationAction[];
  source: PresentationSource;
  metrics: CompiledWorldEventMetrics;
  timeline: readonly PresentationTimelineStep[];
  audio_refs: readonly string[];
  captions: readonly string[];
  /** Renderer-independent text surface for DOM, keyboard, and screen readers. */
  dom_summary: readonly string[];
}>;

export type CompilePresentationInput = Readonly<{
  definition: WorldDefinition;
  state: WorldState;
  /** The committed action group represented by state; empty for seed-only. */
  events: readonly unknown[];
  reduced_motion: boolean;
}>;
