import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  err,
  ok,
  validateBookManifestV2,
  validateChapterTranslation,
  type BookManifestV2,
  type BookResult,
  type BookSummary,
  type ChapterTranslation,
} from "@/modules/book/domain";

export async function loadBookManifest(
  bookId: string,
  rootDir: string = process.cwd(),
): Promise<BookResult<BookManifestV2>> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(bookId)) {
    return err("invalid_manifest", `Invalid book id: ${bookId}`);
  }
  const manifestPath = path.join(
    rootDir,
    "public",
    "books",
    bookId,
    "manifest.json",
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  } catch {
    return err("invalid_manifest", `Unable to read manifest: ${bookId}`, {
      manifestPath,
    });
  }
  return validateBookManifestV2(parsed);
}

export async function loadChapterTranslation(
  bookId: string,
  chapterId: string,
  translationsDir: string = path.join(
    process.cwd(),
    "public",
    "books",
    bookId,
    "translations",
    "zh-CN",
  ),
): Promise<BookResult<ChapterTranslation>> {
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(bookId) ||
    !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(chapterId)
  ) {
    return err("invalid_manifest", "Invalid translation identity", {
      bookId,
      chapterId,
    });
  }
  const translationPath = path.join(translationsDir, `${chapterId}.json`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(translationPath, "utf8")) as unknown;
  } catch {
    return err(
      "invalid_manifest",
      `Unable to read chapter translation: ${chapterId}`,
      { translationPath },
    );
  }
  const validated = validateChapterTranslation(parsed);
  if (!validated.ok) return validated;
  if (
    validated.value.bookId !== bookId ||
    validated.value.chapterId !== chapterId
  ) {
    return err("invalid_manifest", "Chapter translation identity drifted", {
      bookId,
      chapterId,
    });
  }
  return validated;
}

export async function listBookSummaries(
  rootDir: string = process.cwd(),
): Promise<BookResult<BookSummary[]>> {
  const booksDir = path.join(rootDir, "public", "books");
  let bookIds: string[];
  try {
    bookIds = (await readdir(booksDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return err("source_unavailable", "Book asset directory is unavailable", {
      booksDir,
    });
  }

  const summaries: BookSummary[] = [];
  for (const bookId of bookIds) {
    const loaded = await loadBookManifest(bookId, rootDir);
    if (!loaded.ok) return loaded;
    const manifest = loaded.value;
    summaries.push({
      bookId: manifest.bookId,
      title: manifest.title,
      author: manifest.author,
      editionId: manifest.edition.editionId,
      bookCount: manifest.books.length,
      chapterCount: manifest.books.reduce(
        (total, book) => total + book.chapters.length,
        0,
      ),
    });
  }
  return ok(summaries);
}
