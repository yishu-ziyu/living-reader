import type { BodyNode } from "./types";

export type ParagraphSourceId = `smith.b${number}.c${number}.p${number}`;
export type ChapterId = `smith.b${number}.c${number}`;
export type BookPartId = `smith.b${number}`;
export type LegacySourceId =
  | "smith.b1.c1.division"
  | "smith.b1.c3.market_extent";

export type ManifestSourceLocator = {
  provider: "OLL";
  volume: number;
  volumeId: string;
  resource: string;
  fragment: string;
};

export type BookSourceBlock = {
  sourceId: ParagraphSourceId;
  order: number;
  body: BodyNode[];
  /** Exact English source text. Footnote markers and margin notes are separate body nodes. */
  quote: string;
  contentHash: string;
  sourceLocator: ManifestSourceLocator;
  printPage?: string;
};

export type BookChapter = {
  chapterId: ChapterId;
  bookNumber: number;
  chapterNumber: number;
  label: string;
  title: string;
  order: number;
  sourceBlocks: BookSourceBlock[];
};

export type ManifestBookPart = {
  bookId: BookPartId;
  bookNumber: number;
  label: string;
  title: string;
  order: number;
  chapters: BookChapter[];
};

export type ManifestVolume = {
  volume: number;
  volumeId: string;
  resource: string;
  sourcePageUri: string;
  sourcePackageUri: string;
  sourcePackageHash: string;
  contentHash: string;
  rawParagraphIdCount: number;
  startsAt: string;
  endsAt: string;
};

export type NeedsReviewItem = {
  sourceLocator: ManifestSourceLocator;
  reason: string;
  detail?: string;
};

export type BookManifestV2 = {
  schemaVersion: 2;
  bookId: string;
  title: string;
  author: string;
  edition: {
    editionId: string;
    revision: string;
    language: "en";
    label: string;
  };
  volumes: ManifestVolume[];
  books: ManifestBookPart[];
  aliases: Record<LegacySourceId, ParagraphSourceId>;
  needsReview: NeedsReviewItem[];
  build: {
    adapter: "oll-cannan-two-volume-v1";
    rawParagraphIdCount: number;
    includedSourceBlockCount: number;
    filteredParagraphCount: number;
    needsReviewCount: number;
  };
};

export type BookSummary = Pick<
  BookManifestV2,
  "bookId" | "title" | "author"
> & {
  editionId: string;
  bookCount: number;
  chapterCount: number;
};

export type TranslationReviewStatus = "machine" | "human_reviewed";

export type SourceBlockTranslation = {
  sourceId: ParagraphSourceId;
  sourceLocator: ManifestSourceLocator;
  contentHash: string;
  text: string;
  model: string;
  promptRevision: string;
  reviewStatus: TranslationReviewStatus;
  translatedAt: string;
};

export type ChapterTranslation = {
  schemaVersion: 1;
  bookId: string;
  locale: "zh-CN";
  chapterId: ChapterId;
  translations: SourceBlockTranslation[];
};
