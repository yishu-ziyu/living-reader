import Link from "next/link";
import {
  getBookChapter,
  loadBookManifest,
  loadChapterTranslation,
} from "@/modules/book";
import { ChapterReadingShell } from "@/components/reading/ChapterReadingShell";
import { buildChapterReadingModel } from "@/components/reading/buildChapterReadingModel";

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ bookId: string; chapterId: string }>;
}) {
  const { bookId, chapterId } = await params;
  const [manifest, translation] = await Promise.all([
    loadBookManifest(bookId),
    loadChapterTranslation(bookId, chapterId),
  ]);
  if (!manifest.ok) {
    return (
      <ChapterUnavailable
        bookId={bookId}
        chapterId={chapterId}
        reason={manifest.error.message}
      />
    );
  }
  if (!translation.ok) {
    return (
      <ChapterUnavailable
        bookId={bookId}
        chapterId={chapterId}
        reason={translation.error.message}
      />
    );
  }
  const chapter = getBookChapter(manifest.value, chapterId);
  if (!chapter.ok) {
    return (
      <ChapterUnavailable
        bookId={bookId}
        chapterId={chapterId}
        reason={chapter.error.message}
      />
    );
  }
  const model = buildChapterReadingModel(
    manifest.value,
    chapter.value,
    translation.value,
  );
  if (!model) {
    return (
      <ChapterUnavailable
        bookId={bookId}
        chapterId={chapterId}
        reason="译文与当前英文来源版本不一致。"
      />
    );
  }

  return (
    <ChapterReadingShell
      {...model}
      providerSourceEvidence={{}}
      providerDiscussionSnapshots={{}}
      providerVoiceSnapshots={{}}
    />
  );
}

function ChapterUnavailable({
  bookId,
  chapterId,
  reason,
}: {
  bookId: string;
  chapterId: string;
  reason: string;
}) {
  return (
    <main data-testid="chapter-reading-error" style={{ padding: "3rem" }}>
      <p>译文暂不可用</p>
      <h1>{chapterId}</h1>
      <p>{reason}</p>
      <Link href={`/`}>返回《{bookId}》入口</Link>
    </main>
  );
}
