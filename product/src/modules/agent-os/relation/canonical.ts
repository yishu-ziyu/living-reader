/**
 * Pure canonical RelationProposal fixture — no LLM / network.
 * Fires only when both division and market_extent have an active ReaderIdea.
 */
import type {
  ReadingGraphView,
  ReadingIdeaView,
} from "@/modules/reader-world/projections/types";
import {
  CANONICAL_RELATION_ID,
  CANONICAL_RELATION_TYPE,
} from "@/modules/reader-thinking/constants";

export const DIVISION_SOURCE = "smith.b1.c1.division";
export const MARKET_SOURCE = "smith.b1.c3.market_extent";

export type CanonicalProposal = {
  relation_id: string;
  from_id: string;
  to_id: string;
  relation_type: typeof CANONICAL_RELATION_TYPE;
  evidence_refs: string[];
  basis_revision: number;
  summary_zh: string;
};

function activeIdeaForSource(
  graph: ReadingGraphView,
  sourceId: string,
): ReadingIdeaView | null {
  const matches = graph.ideas.filter(
    (i) =>
      i.status === "active" &&
      i.source_ids.includes(sourceId),
  );
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.revision - a.revision)[0] ?? null;
}

/**
 * Returns a proposal when both sources have active ideas; otherwise null.
 * from = specialization (division idea), to = market extent idea.
 */
export function tryCanonicalConstrainedBy(
  graph: ReadingGraphView,
): CanonicalProposal | null {
  const division = activeIdeaForSource(graph, DIVISION_SOURCE);
  const market = activeIdeaForSource(graph, MARKET_SOURCE);
  if (!division || !market) return null;

  const evidence = [
    ...new Set([...division.evidence_refs, ...market.evidence_refs]),
  ];

  return {
    relation_id: CANONICAL_RELATION_ID,
    from_id: division.idea_id,
    to_id: market.idea_id,
    relation_type: CANONICAL_RELATION_TYPE,
    evidence_refs: evidence,
    basis_revision: graph.idea_basis_revision,
    summary_zh: "专业化受市场范围限制。",
  };
}
