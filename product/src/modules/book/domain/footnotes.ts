import { err, ok, type BookResult } from "./errors";
import type { BookArtifact, BodyNode, Footnote } from "./types";

/** Collect target ids referenced by body footnote_ref nodes. */
export function collectFootnoteTargetIds(body: BodyNode[]): string[] {
  const ids: string[] = [];
  for (const node of body) {
    if (node.type === "footnote_ref") {
      ids.push(node.targetId);
    }
  }
  return ids;
}

/**
 * Resolve a footnote target by id.
 * Missing → source_unavailable; never invents content.
 */
export function resolveFootnote(
  book: BookArtifact,
  targetId: string,
): BookResult<Footnote> {
  if (!targetId) {
    return err("missing_locator", "Empty footnote target id");
  }
  const matches = (book.footnotes ?? []).filter((f) => f.id === targetId);
  if (matches.length === 0) {
    return err("source_unavailable", `Footnote target not available: ${targetId}`, {
      targetId,
    });
  }
  if (matches.length > 1) {
    return err("duplicate_locator", `Duplicate footnote target: ${targetId}`, {
      targetId,
      count: matches.length,
    });
  }
  return ok(matches[0]);
}

/**
 * Every footnote_ref in source blocks must resolve to exactly one Footnote.
 */
export function validateFootnoteClosure(
  book: BookArtifact,
): BookResult<BookArtifact> {
  const seenTarget = new Map<string, number>();
  for (const fn of book.footnotes ?? []) {
    if (!fn.id || !fn.text) {
      return err("invalid_manifest", "Footnote missing id or text", {
        id: fn.id,
      });
    }
    seenTarget.set(fn.id, (seenTarget.get(fn.id) ?? 0) + 1);
  }
  for (const [id, count] of seenTarget) {
    if (count > 1) {
      return err("duplicate_locator", `Duplicate footnote id in book: ${id}`, {
        id,
        count,
      });
    }
  }

  for (const block of book.sourceBlocks) {
    for (const targetId of collectFootnoteTargetIds(block.body)) {
      const resolved = resolveFootnote(book, targetId);
      if (!resolved.ok) return resolved;
    }
  }
  return ok(book);
}
