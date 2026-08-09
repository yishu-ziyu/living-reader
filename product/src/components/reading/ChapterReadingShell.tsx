"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SourceDiscussionSnapshot } from "@/modules/agent-os";
import type {
  SourceEvidenceMap,
} from "@/modules/reader-thinking";
import type { VoiceSourceSnapshot } from "@/modules/voice";
import {
  ReaderSessionProvider,
  SessionShellBindings,
} from "@/components/ReaderSessionProvider";
import { ReaderThinkingProvider } from "@/components/ReaderThinkingProvider";
import { VoiceInputProvider } from "@/components/VoiceInputProvider";
import styles from "./chapter-reading-shell.module.css";

export type ReadingSourceBlock = Readonly<{
  sourceId: string;
  locator: string;
  contentHash: string;
  originalText: string;
  evidenceLabel: string;
}>;

export type ReadingChapter = Readonly<{
  bookId: string;
  bookTitle: string;
  author: string;
  editionLabel: string;
  bookPartId: string;
  bookPartLabel: string;
  chapterId: string;
  chapterLabel: string;
  chapterTitle: string;
  sourceBlocks: readonly ReadingSourceBlock[];
}>;

export type ReadingToc = Readonly<{
  books: readonly Readonly<{
    id: string;
    label: string;
    title: string;
    chapters: readonly Readonly<{
      id: string;
      label: string;
      title: string;
      href: string;
    }>[];
  }>[];
}>;

export type ReadingChapterTranslation = Readonly<{
  locale: "zh-CN";
  entries: Readonly<
    Record<
      string,
      Readonly<{
        text: string;
        reviewStatus: "machine" | "human_reviewed";
      }>
    >
  >;
}>;

export type ReaderMemoryView = Readonly<{
  id: string;
  kind: "read_position" | "confusion" | "discussion_theme" | "idea_ref";
  origin: "reader_confirmed" | "agent_observed";
  text: string;
  sourceId?: string;
}>;

export type ChapterReadingShellProps = Readonly<{
  chapter: ReadingChapter;
  toc: ReadingToc;
  translation: ReadingChapterTranslation;
  providerSourceEvidence: SourceEvidenceMap;
  providerDiscussionSnapshots: Readonly<
    Record<string, SourceDiscussionSnapshot>
  >;
  providerVoiceSnapshots: Readonly<Record<string, VoiceSourceSnapshot>>;
  memories?: readonly ReaderMemoryView[];
  resumeSourceId?: string | null;
  onRetire?: (memoryId: string) => void | Promise<void>;
  onResume?: (sourceId: string) => void | Promise<void>;
}>;

type OpenPanel = "toc" | "memory" | null;

/**
 * Current-chapter reader. The three provider maps deliberately remain explicit:
 * the route may seal the current chapter plus reviewed recipe anchors without
 * serializing the whole book into the client bundle.
 */
export function ChapterReadingShell(props: ChapterReadingShellProps) {
  const sourceSnapshotIds = useMemo(
    () => Object.keys(props.providerSourceEvidence),
    [props.providerSourceEvidence],
  );

  return (
    <ReaderSessionProvider sourceSnapshotIds={sourceSnapshotIds}>
      <VoiceInputProvider>
        <ReaderThinkingProvider
          sourceEvidence={props.providerSourceEvidence}
          discussionSnapshots={props.providerDiscussionSnapshots}
          voiceSourceSnapshots={props.providerVoiceSnapshots}
        >
          <SessionShellBindings>
            <ChapterReader {...props} />
          </SessionShellBindings>
        </ReaderThinkingProvider>
      </VoiceInputProvider>
    </ReaderSessionProvider>
  );
}

function ChapterReader({
  chapter,
  toc,
  translation,
  memories = [],
  resumeSourceId = null,
  onRetire,
  onResume,
}: ChapterReadingShellProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [memoryStatus, setMemoryStatus] = useState("");
  const tocButtonRef = useRef<HTMLButtonElement>(null);
  const memoryButtonRef = useRef<HTMLButtonElement>(null);
  const panelCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!openPanel) return;
    panelCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const closing = openPanel;
      setOpenPanel(null);
      requestAnimationFrame(() => {
        (closing === "toc" ? tocButtonRef : memoryButtonRef).current?.focus();
      });
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [openPanel]);

  const closePanel = () => {
    const closing = openPanel;
    setOpenPanel(null);
    requestAnimationFrame(() => {
      (closing === "toc" ? tocButtonRef : memoryButtonRef).current?.focus();
    });
  };

  const resumeBlock = resumeSourceId
    ? chapter.sourceBlocks.find((block) => block.sourceId === resumeSourceId)
    : undefined;

  return (
    <div className={styles.reader} data-testid="chapter-reading-shell">
      <header className={styles.toolbar}>
        <button
          ref={tocButtonRef}
          className={styles.toolbarButton}
          type="button"
          aria-expanded={openPanel === "toc"}
          aria-controls="reading-side-panel"
          onClick={() => setOpenPanel((value) => (value === "toc" ? null : "toc"))}
        >
          目录
        </button>
        <div className={styles.location}>
          <span>{chapter.bookPartLabel} · {chapter.chapterLabel}</span>
          <strong>{chapter.bookTitle}</strong>
        </div>
        <div className={styles.toolbarActions}>
          <button
            className={styles.toolbarButton}
            type="button"
            aria-pressed={showOriginal}
            onClick={() => setShowOriginal((value) => !value)}
          >
            {showOriginal ? "收起原文" : "显示原文对照"}
          </button>
          <button
            ref={memoryButtonRef}
            className={styles.toolbarButton}
            type="button"
            aria-expanded={openPanel === "memory"}
            aria-controls="reading-side-panel"
            onClick={() =>
              setOpenPanel((value) => (value === "memory" ? null : "memory"))
            }
          >
            记忆{memories.length ? ` ${memories.length}` : ""}
          </button>
        </div>
      </header>

      {resumeSourceId ? (
        <div className={styles.resumeBar} data-testid="resume-reading-entry">
          <span>上次读到本章的来源段落</span>
          <button
            type="button"
            onClick={async () => {
              await onResume?.(resumeSourceId);
              if (resumeBlock) {
                document
                  .getElementById(sourceDomId(resumeBlock.sourceId))
                  ?.scrollIntoView({ block: "start" });
              }
            }}
          >
            继续上次阅读
          </button>
        </div>
      ) : null}

      <main className={styles.canvas}>
        <article className={styles.page} aria-labelledby="chapter-title">
          <header className={styles.masthead}>
            <p>{chapter.author} · {chapter.editionLabel}</p>
            <h1 id="chapter-title">{chapter.chapterTitle}</h1>
            <span>{chapter.bookPartLabel} / {chapter.chapterLabel}</span>
          </header>

          <div className={styles.prose}>
            {chapter.sourceBlocks.map((block, index) => {
              const translated = translation.entries[block.sourceId];
              const originalIsOnlyAvailableText = !translated;
              return (
                <section
                  key={block.sourceId}
                  id={sourceDomId(block.sourceId)}
                  className={styles.sourceBlock}
                  data-testid={`chapter-source-block-${index + 1}`}
                  data-source-id={block.sourceId}
                  data-source-locator={block.locator}
                >
                  <aside className={styles.sourceIdentity}>
                    <span>§ {index + 1}</span>
                    <code>{block.sourceId}</code>
                  </aside>
                  <div
                    className={`${styles.passage}${
                      showOriginal && translated ? ` ${styles.isComparing}` : ""
                    }`}
                  >
                    <div data-reading-origin="translation">
                      <PassageLabel
                        label={
                          translated?.reviewStatus === "human_reviewed"
                            ? "人工复核"
                            : "机译"
                        }
                      />
                      {translated ? (
                        <p lang="zh-CN">{translated.text}</p>
                      ) : (
                        <p className={styles.unavailable} role="status">
                          本段译文暂不可用。下方保留可核对的英文原文，不生成替代文本。
                        </p>
                      )}
                    </div>
                    <div
                      className={styles.original}
                      data-reading-origin="original"
                      hidden={!showOriginal && !originalIsOnlyAvailableText}
                    >
                      <PassageLabel label={`${block.evidenceLabel} · 引用与证据依据`} />
                      <p lang="en">{block.originalText}</p>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </article>
      </main>

      {openPanel ? (
        <button
          type="button"
          className={styles.backdrop}
          aria-label="关闭面板"
          onClick={closePanel}
        />
      ) : null}
      <aside
        id="reading-side-panel"
        className={styles.sidePanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reading-side-panel-title"
        hidden={!openPanel}
      >
        <header className={styles.panelHeader}>
          <div>
            <span>{chapter.bookTitle}</span>
            <h2 id="reading-side-panel-title">
              {openPanel === "memory" ? "阅读记忆" : "全书目录"}
            </h2>
          </div>
          <button ref={panelCloseRef} type="button" onClick={closePanel}>
            关闭
          </button>
        </header>
        <div hidden={openPanel !== "toc"}>
          <TableOfContents toc={toc} currentChapterId={chapter.chapterId} />
        </div>
        <div hidden={openPanel !== "memory"}>
          <MemoryPanel
            memories={memories}
            onRetire={onRetire}
            onStatus={setMemoryStatus}
          />
        </div>
        <p className={styles.liveStatus} aria-live="polite">
          {memoryStatus}
        </p>
      </aside>
    </div>
  );
}

function PassageLabel({ label }: { label: string }) {
  return <span className={styles.passageLabel}>{label}</span>;
}

function TableOfContents({
  toc,
  currentChapterId,
}: {
  toc: ReadingToc;
  currentChapterId: string;
}) {
  return (
    <nav className={styles.toc} aria-label="Books I–V 章节目录">
      {toc.books.map((book) => (
        <section key={book.id}>
          <header>
            <span>{book.label}</span>
            <strong>{book.title}</strong>
          </header>
          <ol>
            {book.chapters.map((chapter) => (
              <li key={chapter.id}>
                <a
                  href={chapter.href}
                  aria-current={chapter.id === currentChapterId ? "page" : undefined}
                >
                  <span>{chapter.label}</span>
                  {chapter.title}
                </a>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </nav>
  );
}

function MemoryPanel({
  memories,
  onRetire,
  onStatus,
}: {
  memories: readonly ReaderMemoryView[];
  onRetire?: (memoryId: string) => void | Promise<void>;
  onStatus: (status: string) => void;
}) {
  if (!memories.length) {
    return (
      <p className={styles.emptyMemory}>
        还没有可见记忆。Agent 不会把推断伪装成你的想法。
      </p>
    );
  }

  return (
    <ul className={styles.memoryList}>
      {memories.map((memory) => (
        <li key={memory.id}>
          <div className={styles.memoryMeta}>
            <span data-origin={memory.origin}>
              {memory.origin === "reader_confirmed" ? "读者确认" : "Agent 观察"}
            </span>
            <span>{memoryKindLabel(memory.kind)}</span>
          </div>
          <p>{memory.text}</p>
          {memory.sourceId ? <code>{memory.sourceId}</code> : null}
          {onRetire ? (
            <button
              type="button"
              onClick={async () => {
                await onRetire(memory.id);
                onStatus("这条记忆已删除。");
              }}
            >
              删除
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function memoryKindLabel(kind: ReaderMemoryView["kind"]): string {
  const labels: Record<ReaderMemoryView["kind"], string> = {
    read_position: "阅读位置",
    confusion: "困惑",
    discussion_theme: "讨论主题",
    idea_ref: "想法引用",
  };
  return labels[kind];
}

function sourceDomId(sourceId: string): string {
  return `source-${sourceId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}
