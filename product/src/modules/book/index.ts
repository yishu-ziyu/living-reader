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
} from "@/infrastructure/book/oll";
