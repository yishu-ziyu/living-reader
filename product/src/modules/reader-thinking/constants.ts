/**
 * T005 session / relation constants.
 * Source evidence truth lives in T002 SourceBlock snapshots (see source-evidence.ts).
 * Do NOT reintroduce a handwritten SOURCE_META table as runtime evidence SSOT.
 */

export const LIVE_EXPERIENCE_ID = "exp_live_reader";
export const LIVE_PRINCIPAL_ID = "principal_reader_live";

export const KNOWN_SOURCE_IDS = [
  "smith.b1.c1.division",
  "smith.b1.c3.market_extent",
] as const;

export type KnownSourceId = (typeof KNOWN_SOURCE_IDS)[number];

export const CANONICAL_RELATION_ID = "rel_specialization_constrained_by_market";
export const CANONICAL_RELATION_TYPE = "constrained_by";

export const PRODUCER = {
  module: "reader_world" as const,
  instance: "reader_thinking_t005",
};

export function isKnownSourceId(id: string): id is KnownSourceId {
  return (KNOWN_SOURCE_IDS as readonly string[]).includes(id);
}
