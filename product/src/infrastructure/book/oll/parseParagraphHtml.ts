import {
  err,
  ok,
  quoteFromBody,
  sourceContentHash,
  type BodyNode,
  type BookResult,
} from "@/modules/book/domain";

/**
 * Parse a single OLL <p id="...">...</p> fragment into structured body nodes.
 * Does not rewrite Smith text — only classifies existing markup.
 */
export function extractParagraphById(
  fullHtml: string,
  fragmentId: string,
): BookResult<string> {
  const re = new RegExp(
    `<p\\b[^>]*\\bid="${escapeRegExp(fragmentId)}"[^>]*>[\\s\\S]*?</p>`,
    "i",
  );
  const matches = fullHtml.match(new RegExp(re.source, "gi"));
  if (!matches || matches.length === 0) {
    return err("fragment_not_found", `Fragment not found: ${fragmentId}`, {
      fragmentId,
    });
  }
  if (matches.length > 1) {
    return err("duplicate_locator", `Fragment not unique: ${fragmentId}`, {
      fragmentId,
      count: matches.length,
    });
  }
  return ok(matches[0]);
}

export function parseParagraphInnerHtml(innerHtml: string): BodyNode[] {
  const nodes: BodyNode[] = [];
  let i = 0;
  const s = innerHtml;

  const pushText = (text: string) => {
    if (!text) return;
    // Decode a few entities that appear in OLL HTML; do not alter letters.
    const decoded = decodeBasicEntities(text);
    if (!decoded) return;
    const last = nodes[nodes.length - 1];
    if (last?.type === "text") {
      last.text += decoded;
    } else {
      nodes.push({ type: "text", text: decoded });
    }
  };

  while (i < s.length) {
    if (s[i] === "<") {
      const close = s.indexOf(">", i);
      if (close === -1) {
        pushText(s.slice(i));
        break;
      }
      const tag = s.slice(i, close + 1);
      const lower = tag.toLowerCase();

      // Footnote ref: <a ... class="...footnote...">marker</a>
      if (/^<a\b/i.test(tag) && /footnote/i.test(tag)) {
        const end = s.indexOf("</a>", close + 1);
        if (end === -1) {
          pushText(tag);
          i = close + 1;
          continue;
        }
        const inner = s.slice(close + 1, end);
        const href = attr(tag, "href") ?? "";
        const id = attr(tag, "id") ?? undefined;
        const marker = decodeBasicEntities(stripTags(inner)).trim();
        const targetId = href.startsWith("#") ? href.slice(1) : href;
        if (!targetId) {
          // Leave empty targetId; compile-time closure will fail closed.
          nodes.push({ type: "footnote_ref", marker, href, targetId: "", id });
        } else {
          nodes.push({ type: "footnote_ref", marker, href, targetId, id });
        }
        i = end + 4;
        continue;
      }

      // Margin note: <span class="type-margin">...</span>
      if (/^<span\b/i.test(tag) && /type-margin/i.test(tag)) {
        const end = findMatchingClose(s, i, "span");
        if (end === -1) {
          pushText(tag);
          i = close + 1;
          continue;
        }
        const inner = s.slice(close + 1, end);
        const text = decodeBasicEntities(stripTags(inner)).trim();
        if (text) nodes.push({ type: "margin_note", text });
        i = end + "</span>".length;
        continue;
      }

      // Self-closing or unknown tags: skip tag, keep walking
      if (lower.startsWith("</") || tag.endsWith("/>")) {
        i = close + 1;
        continue;
      }
      // Opening unknown tag — skip open tag only; content still parsed
      i = close + 1;
      continue;
    }

    const next = s.indexOf("<", i);
    if (next === -1) {
      pushText(s.slice(i));
      break;
    }
    pushText(s.slice(i, next));
    i = next;
  }

  return nodes;
}

export function parseOllParagraphFragment(fragmentHtml: string): BookResult<{
  fragmentId: string;
  body: BodyNode[];
  quote: string;
  contentHash: string;
}> {
  const idMatch = fragmentHtml.match(/<p\b[^>]*\bid="([^"]+)"/i);
  if (!idMatch) {
    return err("invalid_fragment", "Paragraph fragment missing id attribute");
  }
  const fragmentId = idMatch[1];
  const openEnd = fragmentHtml.indexOf(">");
  const closeP = fragmentHtml.lastIndexOf("</p>");
  if (openEnd === -1 || closeP === -1 || closeP <= openEnd) {
    return err("invalid_fragment", "Malformed paragraph fragment", {
      fragmentId,
    });
  }
  const inner = fragmentHtml.slice(openEnd + 1, closeP);
  const body = parseParagraphInnerHtml(inner);
  const quote = quoteFromBody(body);
  if (!quote.trim()) {
    return err("invalid_fragment", "Empty quote after parse", { fragmentId });
  }
  const contentHash = sourceContentHash(body, quote);
  return ok({ fragmentId, body, quote, contentHash });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : null;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
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

function findMatchingClose(
  s: string,
  openIndex: number,
  tagName: string,
): number {
  const openRe = new RegExp(`<${tagName}\\b`, "gi");
  const closeRe = new RegExp(`</${tagName}>`, "gi");
  let depth = 0;
  let i = openIndex;
  while (i < s.length) {
    openRe.lastIndex = i;
    closeRe.lastIndex = i;
    const openM = openRe.exec(s);
    const closeM = closeRe.exec(s);
    if (!closeM) return -1;
    if (openM && openM.index < closeM.index) {
      depth += 1;
      i = openM.index + openM[0].length;
      continue;
    }
    depth -= 1;
    if (depth === 0) return closeM.index;
    i = closeM.index + closeM[0].length;
  }
  return -1;
}
