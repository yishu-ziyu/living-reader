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
  }>;
  entities: readonly PresentationEntity[];
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
