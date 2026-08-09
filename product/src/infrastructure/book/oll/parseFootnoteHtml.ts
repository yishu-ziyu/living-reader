import { err, ok, type BookResult, type Footnote } from "@/modules/book/domain";

/**
 * Parse official OLL footnote target HTML:
 * <div id="lf0206-01_footnote_nt114" class="type-footnote note">...</div>
 *
 * Fail-closed if the target id appears more than once in the raw fragment.
 */
export function parseOllFootnoteFragment(
  fragmentHtml: string,
): BookResult<Footnote> {
  if (typeof fragmentHtml !== "string" || !fragmentHtml.trim()) {
    return err("invalid_fragment", "Footnote fragment empty");
  }

  const rootTag = fragmentHtml.match(
    /<div\b[^>]*class="[^"]*\btype-footnote\b[^"]*"[^>]*>/i,
  );
  const idMatch = rootTag?.[0].match(/\bid="([^"]+)"/i);
  if (!idMatch) {
    return err("invalid_fragment", "Footnote fragment missing id");
  }
  const id = idMatch[1];

  // Raw fragment must not contain the same target id more than once.
  const idOccurrences = countAttributeId(fragmentHtml, id);
  if (idOccurrences > 1) {
    return err(
      "duplicate_locator",
      `Footnote target id appears ${idOccurrences} times in raw fragment`,
      { id, count: idOccurrences },
    );
  }

  // Also reject multiple type-footnote roots in one fragment.
  const footnoteRoots = fragmentHtml.match(
    /<div\b[^>]*class="[^"]*type-footnote[^"]*"/gi,
  );
  if (footnoteRoots && footnoteRoots.length > 1) {
    return err(
      "duplicate_locator",
      "Raw footnote fragment contains multiple type-footnote roots",
      { count: footnoteRoots.length },
    );
  }

  const back = fragmentHtml.match(
    /<a\b[^>]*\bhref="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
  );
  const marker = back ? textFromHtml(back[2]) : "";
  const backRefId = back?.[1];

  let text = textFromHtml(fragmentHtml);
  if (marker && text.startsWith(marker)) {
    text = text.slice(marker.length).trim();
  }
  if (!text) {
    return err("invalid_fragment", "Empty footnote text", { id });
  }

  return ok({
    id,
    marker: marker || "?",
    text,
    backRefId,
  });
}

/** Count id="..." attribute occurrences (case-sensitive id value). */
export function countAttributeId(html: string, id: string): number {
  const re = new RegExp(`\\bid="${escapeRegExp(id)}"`, "g");
  return (html.match(re) || []).length;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textFromHtml(html: string): string {
  return decodeBasicEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) =>
      String.fromCodePoint(Number.parseInt(value, 16)),
    )
    .replace(/&#([0-9]+);/g, (_, value: string) =>
      String.fromCodePoint(Number.parseInt(value, 10)),
    )
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
