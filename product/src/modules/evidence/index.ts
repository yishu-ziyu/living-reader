/**
 * Evidence stays in the reading surface. The old drawer state is retained only
 * for callers that still import the T001 placeholder.
 */
export type EvidenceDrawerState = "closed";

export const EVIDENCE_DRAWER_STATE: EvidenceDrawerState = "closed";

export { EvidenceBlock } from "./EvidenceBlock";
export type { EvidenceBlockProps } from "./EvidenceBlock";
