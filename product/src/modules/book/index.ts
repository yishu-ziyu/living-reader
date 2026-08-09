/**
 * Book module public surface.
 * UI → application/domain ← infrastructure adapter.
 */

export * from "./domain";

export {
  loadWealthOfNationsBook,
  requireSourceBlocks,
  compileWealthOfNationsFromFragments,
  parseOllParagraphFragment,
  parseOllFootnoteFragment,
  validateManifestFileShape,
  listBookSummaries,
  loadBookManifest,
  loadChapterTranslation,
} from "@/infrastructure/book/oll";
