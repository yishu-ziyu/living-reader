/**
 * Book domain contracts (T002 freeze).
 * Pure TypeScript — no React, Next, fs, or network.
 */

/** Stable semantic IDs. Never equal to OLL fragment ids or PDF page numbers. */
export type DomainSourceId =
  | "smith.b1.c1.division"
  | "smith.b1.c3.market_extent";

export type SourceKey = "division" | "market";

export type SourceLocator = {
  provider: "OLL";
  resource: "Smith_0206-01.html";
  /** OLL paragraph id, e.g. Smith_0206-01_235 — locator only, not source_id. */
  fragment: string;
};

export type EvidenceRef = {
  kind: "pdf_page";
  /** PDF evidence page (local Cannan PDF display). */
  pdfPage: number;
  /**
   * OLL EPUB edition page from official pb markers, e.g. (5) / (19).
   * Display metadata only — not domain identity.
   */
  printPage?: number;
  /** Optional hash of evidence surface text; not domain identity. */
  textHash?: string;
};

/**
 * Footnote target resolved from OLL note anchors (e.g. lf0206-01_footnote_nt114).
 * Distinct from footnote_ref markers inside SourceBlock body.
 */
export type Footnote = {
  id: string;
  marker: string;
  text: string;
  backRefId?: string;
};

export type BodyNode =
  | { type: "text"; text: string }
  | {
      type: "footnote_ref";
      marker: string;
      href: string;
      /** Target note id without leading #. */
      targetId: string;
      id?: string;
    }
  | { type: "margin_note"; text: string };

export type SourceBlock = {
  sourceId: DomainSourceId;
  sourceKey: SourceKey;
  editionId: string;
  readingOrder: number;
  title: string;
  chapterLabel: string;
  /** Structured body: prose, footnote markers, margin notes. */
  body: BodyNode[];
  /**
   * Exact English quote = concatenation of body text nodes only
   * (excludes margin_note text and footnote markers).
   */
  quote: string;
  /** sha256 of canonical body + quote for drift detection. */
  contentHash: string;
  sourceLocator: SourceLocator;
  evidenceRefs: EvidenceRef[];
  /**
   * Chinese UI gloss only. Never a claimed translation of quote.
   */
  glossZh: string;
};

export type Edition = {
  editionId: string;
  revision: string;
  language: "en";
  label: string;
  sourceUri: string;
  /** Hash of upstream package / HTML used for this edition revision. */
  contentHash: string;
};

export type BookArtifact = {
  bookId: string;
  title: string;
  author: string;
  edition: Edition;
  sourceBlocks: SourceBlock[];
  /** Footnote targets referenced by source bodies (MVP: cited notes only). */
  footnotes: Footnote[];
};

export const DOMAIN_SOURCE_IDS = {
  division: "smith.b1.c1.division",
  market: "smith.b1.c3.market_extent",
} as const satisfies Record<SourceKey, DomainSourceId>;
