/**
 * T007 Agent boundary session — control state only.
 * Not domain fact; never written to EventStore.
 */

import type { IntentKind } from "@/modules/agent-os/guardian/intent";

export type SoftReturnViewModel = {
  turn_id: number;
  /** ≤3 Chinese lines. */
  lines: string[];
  /** Exactly one CTA. */
  cta_label: string;
  /** Always empty — soft-return must not bind source evidence. */
  source_ids: [];
  /** Active SourceBlock id is a UI target only, not evidence. */
  return_source_id: string | null;
};

export type BoundaryTrace = {
  turn_id: number;
  intent: IntentKind;
  reason: string;
  /** Never stores raw user text. */
};

export type BoundarySession = {
  soft_return_declined: boolean;
  last_intent: IntentKind | null;
  turn_id: number;
  soft_return: SoftReturnViewModel | null;
  /** One-line clarification for unknown; no quote/thought. */
  clarification: string | null;
  /** Last non-raw trace for debugging/UI. */
  last_trace: BoundaryTrace | null;
  /** Non-invite status when declined and off_topic again. */
  status_hint: string | null;
};

export function emptyBoundarySession(): BoundarySession {
  return {
    soft_return_declined: false,
    last_intent: null,
    turn_id: 0,
    soft_return: null,
    clarification: null,
    last_trace: null,
    status_hint: null,
  };
}
