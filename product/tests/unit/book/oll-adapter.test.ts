import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertKnownSourceId,
  DOMAIN_SOURCE_IDS,
  getSourceBlockById,
  quoteFromBody,
  resolveFootnote,
  sourceContentHash,
} from "@/modules/book/domain";
import {
  compileWealthOfNationsFromFragments,
  loadBookManifest,
  loadWealthOfNationsBook,
  parseOllFootnoteFragment,
  parseOllParagraphFragment,
  validateManifestFileShape,
} from "@/infrastructure/book/oll";

const root = process.cwd();
const fragDir = path.join(
  root,
  "public/books/wealth-of-nations/fragments",
);
const fnDir = path.join(root, "public/books/wealth-of-nations/footnotes");

function frag(name: string): string {
  return readFileSync(path.join(fragDir, name), "utf8");
}

function footnoteHtml(id: string): string {
  return readFileSync(path.join(fnDir, `${id}.html`), "utf8");
}

const FOOTNOTE_ID = "lf0206-01_footnote_nt114";
const FOOTNOTE_TEXT = "[Ed. 1 reads \u2018improvements\u2019.]";

describe("OLL adapter · exact quotes & pages", () => {
  it("parses division with footnote_ref targetId + margin", () => {
    const html = frag("Smith_0206-01_235.html");
    const parsed = parseOllParagraphFragment(html);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.quote).toContain("THE greatest improvement");
    const ref = parsed.value.body.find((n) => n.type === "footnote_ref");
    expect(ref && ref.type === "footnote_ref" && ref.targetId).toBe(
      FOOTNOTE_ID,
    );
    expect(parsed.value.body.some((n) => n.type === "margin_note")).toBe(true);
    expect(sourceContentHash(parsed.value.body, parsed.value.quote)).toBe(
      parsed.value.contentHash,
    );
    expect(quoteFromBody(parsed.value.body)).toBe(parsed.value.quote);
  });

  it("excludes OLL page-break metadata from source text and hashes", () => {
    const parsed = parseOllParagraphFragment(
      '<p id="Smith_0206-01_236">Before <span class="pb"><span class="decoration">Edition: current; Page: </span><span class="bracket">[</span>6<span class="bracket">]</span></span>after.</p>',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.quote).toBe("Before after.");
    expect(parsed.value.body).toEqual([{ type: "text", text: "Before after." }]);
    expect(parsed.value.quote).not.toContain("Edition:");
  });

  it("loads book with OLL print pages 5/19 and PDF 36/45", async () => {
    const book = await loadWealthOfNationsBook(root);
    expect(book.ok).toBe(true);
    if (!book.ok) return;
    const [division, market] = book.value.sourceBlocks;
    expect(division.sourceId).toBe(DOMAIN_SOURCE_IDS.division);
    expect(market.sourceId).toBe(DOMAIN_SOURCE_IDS.market);
    expect(division.evidenceRefs[0]).toMatchObject({
      pdfPage: 36,
      printPage: 5,
    });
    expect(market.evidenceRefs[0]).toMatchObject({
      pdfPage: 45,
      printPage: 19,
    });
    expect(division.sourceLocator.fragment).toBe("Smith_0206-01_235");
    expect(market.sourceLocator.fragment).toBe("Smith_0206-01_251");
  });

  it("reconstructs both legacy Agent aliases from canonical manifest v2 blocks", async () => {
    const manifest = await loadBookManifest("wealth-of-nations", root);
    const book = await loadWealthOfNationsBook(root);
    expect(manifest.ok).toBe(true);
    expect(book.ok).toBe(true);
    if (!manifest.ok || !book.ok) return;

    const canonicalBlocks = manifest.value.books.flatMap((bookPart) =>
      bookPart.chapters.flatMap((chapter) => chapter.sourceBlocks),
    );
    for (const sourceKey of ["division", "market"] as const) {
      const alias = DOMAIN_SOURCE_IDS[sourceKey];
      const canonicalId = manifest.value.aliases[alias];
      const canonical = canonicalBlocks.find(
        (block) => block.sourceId === canonicalId,
      );
      const reconstructed = getSourceBlockById(book.value.sourceBlocks, alias);
      expect(canonical).toBeDefined();
      expect(reconstructed.ok).toBe(true);
      if (!canonical || !reconstructed.ok) continue;
      expect(reconstructed.value.body).toEqual(canonical.body);
      expect(reconstructed.value.quote).toBe(canonical.quote);
      expect(reconstructed.value.contentHash).toBe(canonical.contentHash);
    }
  });
});

describe("footnote closure", () => {
  it("parses official footnote target text", () => {
    const parsed = parseOllFootnoteFragment(footnoteHtml(FOOTNOTE_ID));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.id).toBe(FOOTNOTE_ID);
    expect(parsed.value.text).toBe(FOOTNOTE_TEXT);
  });

  it("resolves division footnote_ref to unique target", async () => {
    const book = await loadWealthOfNationsBook(root);
    expect(book.ok).toBe(true);
    if (!book.ok) return;
    const resolved = resolveFootnote(book.value, FOOTNOTE_ID);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.text).toBe(FOOTNOTE_TEXT);
    expect(book.value.footnotes).toHaveLength(1);
  });

  it("missing footnote target fails closed", () => {
    const html = frag("Smith_0206-01_235.html");
    const parsed = parseOllParagraphFragment(html);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = compileWealthOfNationsFromFragments({
      bookId: "x",
      title: "x",
      author: "x",
      edition: {
        editionId: "e",
        revision: "r",
        language: "en",
        label: "l",
        sourceUri: "u",
        contentHash: "h",
      },
      sources: [
        {
          sourceKey: "division",
          sourceId: DOMAIN_SOURCE_IDS.division,
          readingOrder: 1,
          title: "t",
          chapterLabel: "c",
          fragment: "Smith_0206-01_235",
          pdfPage: 36,
          printPage: 5,
          glossZh: "g",
          expectedQuote: parsed.value.quote,
          expectedContentHash: parsed.value.contentHash,
        },
      ],
      fragments: { "Smith_0206-01_235": html },
      footnoteHtml: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("source_unavailable");
  });
});

describe("runtime manifest v2 cutover", () => {
  it("rejects a well-shaped legacy sources manifest instead of loading fragments", async () => {
    const runtimeRoot = writeRuntimeManifest({
      schemaVersion: 1,
      bookId: "wealth-of-nations",
      title: "Legacy title",
      author: "Adam Smith",
      edition: {
        editionId: "legacy",
        revision: "legacy",
        language: "en",
        label: "Legacy",
        sourceUri: "https://example.invalid/legacy",
        contentHash: "legacy",
      },
      sources: [
        {
          sourceKey: "division",
          sourceId: DOMAIN_SOURCE_IDS.division,
          readingOrder: 1,
          title: "Division",
          chapterLabel: "Book I",
          fragment: "legacy-fragment",
          pdfPage: 1,
          printPage: 1,
          glossZh: "旧版",
          expectedQuote: "Legacy quote",
          expectedContentHash: "legacy-hash",
          fragmentPath: "fragments/legacy.html",
        },
      ],
    });
    try {
      await expect(loadWealthOfNationsBook(runtimeRoot)).resolves.toMatchObject({
        ok: false,
        error: { code: "invalid_manifest" },
      });
    } finally {
      rmSync(runtimeRoot, { recursive: true, force: true });
    }
  });

  it.each([
    ["unknown schema", { schemaVersion: 3 }],
    ["malformed root", null],
    ["malformed v2", { schemaVersion: 2, bookId: "wealth-of-nations" }],
  ])("rejects %s fail-closed", async (_label, manifest) => {
    const runtimeRoot = writeRuntimeManifest(manifest);
    try {
      await expect(loadWealthOfNationsBook(runtimeRoot)).resolves.toMatchObject({
        ok: false,
        error: { code: "invalid_manifest" },
      });
    } finally {
      rmSync(runtimeRoot, { recursive: true, force: true });
    }
  });
});

function writeRuntimeManifest(manifest: unknown): string {
  const runtimeRoot = mkdtempSync(
    path.join(os.tmpdir(), "living-reader-manifest-v2-"),
  );
  const bookDir = path.join(
    runtimeRoot,
    "public/books/wealth-of-nations",
  );
  mkdirSync(bookDir, { recursive: true });
  writeFileSync(path.join(bookDir, "manifest.json"), JSON.stringify(manifest));
  return runtimeRoot;
}

describe("manifest fail-closed shape", () => {
  it("sources non-array → invalid_manifest without throw", () => {
    const shaped = validateManifestFileShape({
      bookId: "x",
      title: "t",
      author: "a",
      edition: {
        editionId: "e",
        revision: "r",
        language: "en",
        label: "l",
        sourceUri: "u",
        contentHash: "h",
      },
      sources: "not-an-array",
    });
    expect(shaped.ok).toBe(false);
    if (shaped.ok) return;
    expect(shaped.error.code).toBe("invalid_manifest");

    expect(() =>
      compileWealthOfNationsFromFragments({
        bookId: "x",
        title: "t",
        author: "a",
        edition: {
          editionId: "e",
          revision: "r",
          language: "en",
          label: "l",
          sourceUri: "u",
          contentHash: "h",
        },
        // @ts-expect-error intentional malformed for runtime guard
        sources: "not-an-array",
        fragments: {},
      }),
    ).not.toThrow();
    const compiled = compileWealthOfNationsFromFragments({
      bookId: "x",
      title: "t",
      author: "a",
      edition: {
        editionId: "e",
        revision: "r",
        language: "en",
        label: "l",
        sourceUri: "u",
        contentHash: "h",
      },
      // @ts-expect-error intentional malformed
      sources: "not-an-array",
      fragments: {},
    });
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.error.code).toBe("invalid_manifest");
  });

  it("empty edition fields → invalid_manifest", () => {
    const shaped = validateManifestFileShape({
      bookId: "x",
      title: "t",
      author: "a",
      edition: {
        editionId: "e",
        revision: "",
        language: "en",
        label: "l",
        sourceUri: "u",
        contentHash: "h",
      },
      sources: [],
    });
    expect(shaped.ok).toBe(false);
    if (shaped.ok) return;
    expect(shaped.error.code).toBe("invalid_manifest");
  });

  it("missing fragments map → invalid_manifest", () => {
    const html = frag("Smith_0206-01_235.html");
    const parsed = parseOllParagraphFragment(html);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const compiled = compileWealthOfNationsFromFragments({
      bookId: "x",
      title: "t",
      author: "a",
      edition: {
        editionId: "e",
        revision: "r",
        language: "en",
        label: "l",
        sourceUri: "u",
        contentHash: "h",
      },
      sources: [
        {
          sourceKey: "division",
          sourceId: DOMAIN_SOURCE_IDS.division,
          readingOrder: 1,
          title: "t",
          chapterLabel: "c",
          fragment: "Smith_0206-01_235",
          pdfPage: 36,
          printPage: 5,
          glossZh: "g",
          expectedQuote: parsed.value.quote,
          expectedContentHash: parsed.value.contentHash,
        },
      ],
      // @ts-expect-error intentional
      fragments: null,
    });
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.error.code).toBe("invalid_manifest");
  });
});

describe("fail-closed unknown / drift / duplicate", () => {
  it("unknown source_id is unavailable", async () => {
    const book = await loadWealthOfNationsBook(root);
    expect(book.ok).toBe(true);
    if (!book.ok) return;
    const unknown = getSourceBlockById(
      book.value.sourceBlocks,
      "smith.b9.fake",
    );
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.error.code).toBe("unknown_source");
    expect(assertKnownSourceId("smith.b9.fake").ok).toBe(false);
  });

  it("quote hash drift fails closed", () => {
    const html = frag("Smith_0206-01_235.html");
    const parsed = parseOllParagraphFragment(html);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = compileWealthOfNationsFromFragments({
      bookId: "x",
      title: "x",
      author: "x",
      edition: {
        editionId: "e",
        revision: "r",
        language: "en",
        label: "l",
        sourceUri: "u",
        contentHash: "h",
      },
      sources: [
        {
          sourceKey: "division",
          sourceId: DOMAIN_SOURCE_IDS.division,
          readingOrder: 1,
          title: "t",
          chapterLabel: "c",
          fragment: "Smith_0206-01_235",
          pdfPage: 36,
          printPage: 5,
          glossZh: "g",
          expectedQuote: "FORGED QUOTE NOT IN SOURCE",
          expectedContentHash: parsed.value.contentHash,
        },
      ],
      fragments: { "Smith_0206-01_235": html },
      footnoteHtml: { [FOOTNOTE_ID]: footnoteHtml(FOOTNOTE_ID) },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("quote_hash_drift");
  });

  it("duplicate locator fails closed", () => {
    const html = frag("Smith_0206-01_235.html");
    const parsed = parseOllParagraphFragment(html);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = compileWealthOfNationsFromFragments({
      bookId: "x",
      title: "x",
      author: "x",
      edition: {
        editionId: "e",
        revision: "r",
        language: "en",
        label: "l",
        sourceUri: "u",
        contentHash: "h",
      },
      sources: [
        {
          sourceKey: "division",
          sourceId: DOMAIN_SOURCE_IDS.division,
          readingOrder: 1,
          title: "t",
          chapterLabel: "c",
          fragment: "Smith_0206-01_235",
          pdfPage: 36,
          printPage: 5,
          glossZh: "g",
          expectedQuote: parsed.value.quote,
          expectedContentHash: parsed.value.contentHash,
        },
        {
          sourceKey: "market",
          sourceId: DOMAIN_SOURCE_IDS.market,
          readingOrder: 2,
          title: "t",
          chapterLabel: "c",
          fragment: "Smith_0206-01_235",
          pdfPage: 45,
          printPage: 19,
          glossZh: "g",
          expectedQuote: parsed.value.quote,
          expectedContentHash: parsed.value.contentHash,
        },
      ],
      fragments: { "Smith_0206-01_235": html },
      footnoteHtml: { [FOOTNOTE_ID]: footnoteHtml(FOOTNOTE_ID) },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("duplicate_locator");
  });
});

describe("F19/F20 contract · compile entry & footnote uniqueness", () => {
  function validDivisionSpec(
    quote: string,
    hash: string,
  ): Record<string, unknown> {
    return {
      sourceKey: "division",
      sourceId: DOMAIN_SOURCE_IDS.division,
      readingOrder: 1,
      title: "t",
      chapterLabel: "c",
      fragment: "Smith_0206-01_235",
      pdfPage: 36,
      printPage: 5,
      glossZh: "g",
      expectedQuote: quote,
      expectedContentHash: hash,
    };
  }

  it("source spec missing title → invalid_manifest (no half SourceBlock)", () => {
    const html = frag("Smith_0206-01_235.html");
    const parsed = parseOllParagraphFragment(html);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const spec = validDivisionSpec(
      parsed.value.quote,
      parsed.value.contentHash,
    );
    delete spec.title;
    const result = compileWealthOfNationsFromFragments({
      bookId: "x",
      title: "x",
      author: "x",
      edition: {
        editionId: "e",
        revision: "r",
        language: "en",
        label: "l",
        sourceUri: "u",
        contentHash: "h",
      },
      // @ts-expect-error intentional incomplete source spec
      sources: [spec],
      fragments: { "Smith_0206-01_235": html },
      footnoteHtml: { [FOOTNOTE_ID]: footnoteHtml(FOOTNOTE_ID) },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_manifest");
    expect(result.error.message).toMatch(/title/i);
  });

  it("edition.language not en → invalid_manifest (no coerce)", () => {
    const html = frag("Smith_0206-01_235.html");
    const parsed = parseOllParagraphFragment(html);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const shaped = validateManifestFileShape({
      bookId: "x",
      title: "t",
      author: "a",
      edition: {
        editionId: "e",
        revision: "r",
        language: "zh",
        label: "l",
        sourceUri: "u",
        contentHash: "h",
      },
      sources: [
        {
          ...validDivisionSpec(parsed.value.quote, parsed.value.contentHash),
          fragmentPath: "fragments/Smith_0206-01_235.html",
        },
      ],
    });
    expect(shaped.ok).toBe(false);
    if (shaped.ok) return;
    expect(shaped.error.code).toBe("invalid_manifest");

    const compiled = compileWealthOfNationsFromFragments({
      bookId: "x",
      title: "x",
      author: "x",
      edition: {
        editionId: "e",
        revision: "r",
        // @ts-expect-error intentional non-en language
        language: "zh",
        label: "l",
        sourceUri: "u",
        contentHash: "h",
      },
      sources: [
        validDivisionSpec(
          parsed.value.quote,
          parsed.value.contentHash,
        ) as never,
      ],
      fragments: { "Smith_0206-01_235": html },
      footnoteHtml: { [FOOTNOTE_ID]: footnoteHtml(FOOTNOTE_ID) },
    });
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.error.code).toBe("invalid_manifest");
    expect(compiled.error.message).toMatch(/language/);
  });

  it("manifest duplicate footnotes.id → duplicate_locator before overwrite", () => {
    const shaped = validateManifestFileShape({
      bookId: "x",
      title: "t",
      author: "a",
      edition: {
        editionId: "e",
        revision: "r",
        language: "en",
        label: "l",
        sourceUri: "u",
        contentHash: "h",
      },
      sources: [
        {
          sourceKey: "division",
          sourceId: DOMAIN_SOURCE_IDS.division,
          readingOrder: 1,
          title: "t",
          chapterLabel: "c",
          fragment: "Smith_0206-01_235",
          pdfPage: 36,
          printPage: 5,
          glossZh: "g",
          expectedQuote: "q",
          expectedContentHash: "h",
          fragmentPath: "fragments/Smith_0206-01_235.html",
        },
      ],
      footnotes: [
        {
          id: FOOTNOTE_ID,
          path: "footnotes/lf0206-01_footnote_nt114.html",
        },
        {
          id: FOOTNOTE_ID,
          path: "footnotes/lf0206-01_footnote_nt114.html",
        },
      ],
    });
    expect(shaped.ok).toBe(false);
    if (shaped.ok) return;
    expect(shaped.error.code).toBe("duplicate_locator");
  });

  it("raw footnote fragment with duplicate target id → fail-closed", () => {
    const once = footnoteHtml(FOOTNOTE_ID);
    const duplicated = `${once}\n${once}`;
    const parsed = parseOllFootnoteFragment(duplicated);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe("duplicate_locator");

    const html = frag("Smith_0206-01_235.html");
    const body = parseOllParagraphFragment(html);
    expect(body.ok).toBe(true);
    if (!body.ok) return;
    const compiled = compileWealthOfNationsFromFragments({
      bookId: "x",
      title: "x",
      author: "x",
      edition: {
        editionId: "e",
        revision: "r",
        language: "en",
        label: "l",
        sourceUri: "u",
        contentHash: "h",
      },
      sources: [
        validDivisionSpec(
          body.value.quote,
          body.value.contentHash,
        ) as never,
      ],
      fragments: { "Smith_0206-01_235": html },
      footnoteHtml: { [FOOTNOTE_ID]: duplicated },
    });
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.error.code).toBe("duplicate_locator");
  });
});
