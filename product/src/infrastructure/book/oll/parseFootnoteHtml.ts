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

  const idMatch =
    fragmentHtml.match(
      /<div\b[^>]*\bid="([^"]+)"[^>]*class="[^"]*type-footnote[^"]*"/i,
    ) || fragmentHtml.match(/id="(lf0206-01_footnote_nt\d+)"/i);
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
  const marker = back
    ? decodeBasicEntities(stripTags(back[2])).trim()
    : "";
  const backRefId = back?.[1];

  const pMatch = fragmentHtml.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
  let text = pMatch
    ? decodeBasicEntities(stripTags(pMatch[1])).trim()
    : decodeBasicEntities(stripTags(fragmentHtml)).trim();
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

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&#x2019;/gi, "\u2019")
    .replace(/&#x2018;/gi, "\u2018")
    .replace(/&#8217;/g, "\u2019")
    .replace(/&#8216;/g, "\u2018")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
