/**
 * T006 Source discussion + BookThought candidate contracts.
 * CompanionAnswer is transient; only accepted BookThought hits EventStore.
 */

import type { SourceEvidenceSnapshot } from "@/modules/reader-thinking/source-evidence";

export type ThoughtKind = "inference" | "experiment" | "quote";

/** Live discussion binding to one active SourceBlock (from T002). */
export type SourceDiscussionSnapshot = {
  source_id: string;
  /** Exact English quote of the active SourceBlock (body text only). */
  quote: string;
  fragment: string;
  pdf_page?: number;
  print_page: number;
  edition_id: string;
  edition_revision: string;
  edition_content_hash: string;
  source_content_hash: string;
  evidence_refs: string[];
};

export type SourceDiscussionRequest = {
  question_zh: string;
  source: SourceDiscussionSnapshot;
};

/** Schema-valid provider output before Guardian. */
export type CompanionProviderCandidate = {
  answer_zh: string;
  quote_exact: string;
  inference_zh: string;
  thought_kind: ThoughtKind;
  confidence: number;
  open_question: string | null;
  source_ids: string[];
  evidence_refs: string[];
};

/** Transient UI candidate after Guardian pass. */
export type BookThoughtCandidate = CompanionProviderCandidate & {
  candidate_id: string;
  /** Frozen source snapshot identity at ask time. */
  source_snapshot: SourceDiscussionSnapshot;
  stale: boolean;
};

export type CompanionAnswer = {
  answer_zh: string;
  quote_exact: string;
  inference_zh: string;
  confidence: number;
  open_question: string | null;
  source: SourceDiscussionSnapshot;
};

export function discussionSnapshotFromEvidence(
  evidence: SourceEvidenceSnapshot,
  quote: string,
): SourceDiscussionSnapshot {
  return {
    source_id: evidence.source_id,
    quote,
    fragment: evidence.fragment,
    ...(evidence.pdf_page === undefined
      ? {}
      : { pdf_page: evidence.pdf_page }),
    print_page: evidence.print_page,
    edition_id: evidence.edition_id,
    edition_revision: evidence.edition_revision,
    edition_content_hash: evidence.edition_content_hash,
    source_content_hash: evidence.source_content_hash,
    evidence_refs: [...evidence.evidence_refs],
  };
}
