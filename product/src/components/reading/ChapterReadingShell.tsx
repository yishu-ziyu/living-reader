"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type {
  RelationshipContext,
  SourceDiscussionSnapshot,
} from "@/modules/agent-os";
import type {
  SourceEvidenceMap,
} from "@/modules/reader-thinking";
import type { VoiceSourceSnapshot } from "@/modules/voice";
import {
  ReaderSessionProvider,
  SessionShellBindings,
} from "@/components/ReaderSessionProvider";
import {
  AgentTurnCompanionLine,
  ReaderThinkingProvider,
  useReaderThinking,
} from "@/components/ReaderThinkingProvider";
import { VoiceInputProvider } from "@/components/VoiceInputProvider";
import { SourceDiscussionComposer } from "@/components/SourceDiscussionComposer";
import { FootnoteList, SourceBody } from "@/components/SourceBody";
import type { BodyNode, Footnote } from "@/modules/book";
import { ReaderIdeaComposer } from "@/components/ReaderIdeaComposer";
import {
  ReaderThinkingRailRelation,
  ThinkingStatusBanner,
} from "@/components/ReaderThinkingPanel";
import { InlineWorldBlock } from "@/modules/world/components";
import {
  buildRelationshipContext,
  type MemoryProjection,
  type RelationshipMemoryEntry,
} from "@/modules/reader-world/memory";
import styles from "./chapter-reading-shell.module.css";
import { useChapterMemoryClient } from "./useChapterMemoryClient";

export type ReadingSourceBlock = Readonly<{
  sourceId: string;
  locator: string;
  contentHash: string;
  body: BodyNode[];
  footnotes: Footnote[];
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
  onReadPosition?: (sourceId: string) => Promise<void>;
}>;

type OpenPanel = "toc" | "memory" | null;

type ChapterReaderProps = ChapterReadingShellProps &
  Readonly<{
    memoryLoading: boolean;
    memoryError: string | null;
  }>;

/**
 * Current-chapter reader. The three provider maps deliberately remain explicit:
 * the route may seal the current chapter plus reviewed recipe anchors without
 * serializing the whole book into the client bundle.
 */
export function ChapterReadingShell(props: ChapterReadingShellProps) {
  const canonicalSourceIds = useMemo(
    () => props.chapter.sourceBlocks.map((block) => block.sourceId),
    [props.chapter.sourceBlocks],
  );
  const controlledMemory = props.memories !== undefined;
  const memoryClient = useChapterMemoryClient({
    chapter_id: props.chapter.chapterId,
    source_ids: canonicalSourceIds,
    enabled: !controlledMemory,
  });
  const runtimeMemories = useMemo<readonly ReaderMemoryView[]>(
    () =>
      (memoryClient.snapshot?.projection.memories ?? [])
        .filter(
          (memory): memory is RelationshipMemoryEntry =>
            memory.kind !== "invitation_question",
        )
        .map((memory) => ({
        id: memory.memory_id,
        kind: memory.kind,
        origin: memory.origin,
        text: memory.text,
        sourceId: memory.source_locator ?? undefined,
        })),
    [memoryClient.snapshot],
  );
  const sourceSnapshotIds = useMemo(
    () => [
      ...new Set([
        ...canonicalSourceIds,
        ...Object.keys(props.providerSourceEvidence),
      ]),
    ],
    [canonicalSourceIds, props.providerSourceEvidence],
  );
  const relationshipContext = useMemo<RelationshipContext>(() => {
    const projection: MemoryProjection =
      memoryClient.snapshot?.projection ?? {
        experience_id: "exp_live_reader",
        memories: (props.memories ?? []).map((memory) => ({
          memory_id: memory.id,
          kind: memory.kind,
          origin: memory.origin,
          text: memory.text,
          source_locator: memory.sourceId ?? null,
          reader_idea_id: null,
        })),
        retired_memory_ids: [],
        last_stream_version: 0,
      };
    return buildRelationshipContext(projection, {
      current_chapter_id: props.chapter.chapterId,
    });
  }, [
    memoryClient.snapshot,
    props.chapter.chapterId,
    props.memories,
  ]);

  return (
    <ReaderSessionProvider sourceSnapshotIds={sourceSnapshotIds}>
      <VoiceInputProvider>
        <ReaderThinkingProvider
          sourceEvidence={props.providerSourceEvidence}
          discussionSnapshots={props.providerDiscussionSnapshots}
          relationshipContext={relationshipContext}
          voiceSourceSnapshots={props.providerVoiceSnapshots}
        >
          <SessionShellBindings>
            <ChapterReader
              {...props}
              memories={controlledMemory ? props.memories : runtimeMemories}
              resumeSourceId={
                controlledMemory
                  ? props.resumeSourceId
                  : memoryClient.snapshot?.resume_source_id
              }
              onRetire={
                controlledMemory ? props.onRetire : memoryClient.retire_memory
              }
              onResume={
                controlledMemory
                  ? props.onResume
                  : memoryClient.record_read_position
              }
              onReadPosition={
                controlledMemory
                  ? props.onReadPosition
                  : memoryClient.record_read_position
              }
              memoryLoading={!controlledMemory && memoryClient.status === "loading"}
              memoryError={controlledMemory ? null : memoryClient.error}
            />
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
  onReadPosition,
  memoryLoading,
  memoryError,
}: ChapterReaderProps) {
  const router = useRouter();
  const [showOriginal, setShowOriginal] = useState(false);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [memoryStatus, setMemoryStatus] = useState("");
  const readerRef = useRef<HTMLDivElement>(null);
  const tocButtonRef = useRef<HTMLButtonElement>(null);
  const memoryButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const panelCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!openPanel) return;
    const panel = panelRef.current;
    (panelCloseRef.current ?? panel)?.focus();
    const handlePanelKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const closing = openPanel;
        setOpenPanel(null);
        requestAnimationFrame(() => {
          (closing === "toc" ? tocButtonRef : memoryButtonRef).current?.focus();
        });
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const focusableElements = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          element.tabIndex >= 0 &&
          !element.closest("[hidden]") &&
          element.getClientRects().length > 0,
      );
      if (focusableElements.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      const focusIsInside =
        activeElement instanceof HTMLElement &&
        focusableElements.includes(activeElement);
      if (focusableElements.length === 1) {
        event.preventDefault();
        firstFocusable.focus();
        return;
      }
      if (event.shiftKey) {
        if (!focusIsInside || activeElement === firstFocusable) {
          event.preventDefault();
          lastFocusable.focus();
        }
        return;
      }
      if (!focusIsInside || activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };
    window.addEventListener("keydown", handlePanelKeyDown);
    return () => window.removeEventListener("keydown", handlePanelKeyDown);
  }, [openPanel]);

  useEffect(() => {
    if (!onReadPosition) return;
    const reader = readerRef.current;
    if (!reader) return;
    let timer: number | null = null;
    const recordVisiblePosition = () => {
      const sourceId = sourceAtReadingAnchor(reader);
      if (!sourceId) return;
      void onReadPosition(sourceId).catch(() => undefined);
    };
    const scheduleRecord = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(recordVisiblePosition, 180);
    };
    window.addEventListener("scroll", scheduleRecord, { passive: true });
    return () => {
      window.removeEventListener("scroll", scheduleRecord);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [chapter.chapterId, onReadPosition]);

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

  const returnToSource = (sourceId: string) => {
    const canonical = canonicalSourceId(sourceId);
    const local = chapter.sourceBlocks.find((block) => block.sourceId === canonical);
    if (local) {
      const target = document.getElementById(sourceDomId(local.sourceId));
      target?.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
      target?.focus({ preventScroll: true });
      return;
    }
    const targetChapterId = chapterIdForSource(canonical);
    if (targetChapterId) {
      router.push(
        `/read/${encodeURIComponent(chapter.bookId)}/${encodeURIComponent(
          targetChapterId,
        )}#${sourceDomId(canonical)}`,
      );
    }
  };

  return (
    <div ref={readerRef} className={styles.reader} data-testid="chapter-reading-shell">
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
              const agentSourceId = agentSourceIdFor(block.sourceId);
              return (
                <Fragment key={block.sourceId}>
                  <section
                    id={sourceDomId(block.sourceId)}
                    className={styles.sourceBlock}
                    data-testid={`chapter-source-block-${index + 1}`}
                    data-source-id={block.sourceId}
                    data-source-locator={block.locator}
                    tabIndex={-1}
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
                        <PassageLabel
                          label={`${block.evidenceLabel} · 引用与证据依据`}
                        />
                        <p lang="en">
                          <SourceBody
                            body={block.body}
                            footnotes={block.footnotes}
                          />
                        </p>
                        <FootnoteList footnotes={block.footnotes} />
                      </div>
                    </div>
                  </section>
                  <SourceAgentExperience
                    label={chapter.chapterLabel}
                    onReturnToSource={returnToSource}
                    sourceId={agentSourceId}
                  />
                </Fragment>
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
        ref={panelRef}
        id="reading-side-panel"
        className={styles.sidePanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reading-side-panel-title"
        hidden={!openPanel}
        tabIndex={-1}
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
            loading={memoryLoading}
            error={memoryError}
          />
        </div>
        <p className={styles.liveStatus} aria-live="polite">
          {memoryStatus}
        </p>
      </aside>
    </div>
  );
}

function SourceAgentExperience({
  sourceId,
  label,
  onReturnToSource,
}: {
  sourceId: string;
  label: string;
  onReturnToSource: (sourceId: string) => void;
}) {
  const thinking = useReaderThinking();
  const isActive = thinking.activeSubmittedSourceId === sourceId;
  const decision = thinking.agentTurnState.last_decision;
  const invitation =
    decision?.mode === "invite_world" ? decision.invitation : null;
  const worldCanReopen =
    isActive &&
    thinking.worldUiState === "closed" &&
    thinking.worldPresentation !== null &&
    thinking.worldEvidence !== null;
  const invitationVisible =
    isActive &&
    invitation &&
    !worldCanReopen &&
    (thinking.worldUiState === "closed" || thinking.worldUiState === "error");
  const worldVisible =
    isActive &&
    (thinking.worldUiState === "constructing" ||
      (thinking.worldUiState === "open" &&
        thinking.worldPresentation !== null &&
        thinking.worldEvidence !== null));

  return (
    <section
      aria-labelledby={`agent-source-title-${sourceId}`}
      className={styles.agentZone}
      data-agent-source-id={sourceId}
      data-agent-active={isActive ? "true" : "false"}
      data-testid="chapter-agent-zone"
    >
      <header className={styles.agentZoneHeader}>
        <div>
          <span>陪读 Agent</span>
          <h2 id={`agent-source-title-${sourceId}`}>从这段原文继续想</h2>
        </div>
        <p>先谈原文。只有你明确接受邀请，世界才会在这里展开。</p>
      </header>

      <SourceDiscussionComposer
        label={label}
        showStatus={isActive}
        sourceId={sourceId}
      />
      {isActive ? <AgentTurnCompanionLine /> : null}

      {worldCanReopen ? (
        <button
          className="world-reopen"
          data-testid="world-reopen"
          onClick={thinking.reopenWorld}
          type="button"
        >
          重新打开刚才的世界
        </button>
      ) : null}

      {invitationVisible ? (
        <aside
          aria-label="进入可执行世界的邀请"
          className={styles.worldInvitation}
          data-testid="world-invitation"
        >
          <div aria-atomic="true" aria-live="polite">
            <span>Agent 邀请</span>
            <h3>{invitation.trigger_question}</h3>
            <p>{invitation.reason}</p>
          </div>
          <div className={styles.invitationActions}>
            <button
              data-testid="world-invitation-decline"
              disabled={thinking.status.kind === "busy"}
              onClick={thinking.declineWorldInvitation}
              type="button"
            >
              继续读原文
            </button>
            <button
              data-testid="world-invitation-accept"
              disabled={thinking.status.kind === "busy"}
              onClick={async () => {
                const opening = thinking.acceptWorldInvitation();
                requestAnimationFrame(() => {
                  document
                    .getElementById("inline-reader-world")
                    ?.scrollIntoView({ block: "center" });
                });
                await opening;
              }}
              type="button"
            >
              接受并建造世界
            </button>
          </div>
        </aside>
      ) : null}

      {worldVisible ? (
        thinking.worldPresentation && thinking.worldEvidence ? (
          <InlineWorldBlock
            evidence={thinking.worldEvidence}
            actionPending={thinking.worldActionPending}
            onAction={(actionId) => {
              void thinking.actInWorld(actionId);
            }}
            onCollapse={thinking.collapseWorld}
            onConstructionComplete={thinking.completeWorldConstruction}
            onReturnToSource={onReturnToSource}
            plan={thinking.worldPresentation}
            state={
              thinking.worldUiState === "constructing" ? "constructing" : "open"
            }
          />
        ) : (
          <InlineWorldBlock
            onCollapse={thinking.collapseWorld}
            state="loading"
          />
        )
      ) : null}

      {isActive ? (
        <>
          <details className={styles.relationSetup}>
            <summary>想法与跨章节关系</summary>
            <div>
              <ReaderIdeaComposer label={label} sourceId={sourceId} />
              <ReaderThinkingRailRelation />
            </div>
          </details>
          <ThinkingStatusBanner />
        </>
      ) : null}
    </section>
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
  loading,
  error,
}: {
  memories: readonly ReaderMemoryView[];
  onRetire?: (memoryId: string) => void | Promise<void>;
  onStatus: (status: string) => void;
  loading: boolean;
  error: string | null;
}) {
  const [retiringId, setRetiringId] = useState<string | null>(null);

  if (loading) {
    return <p className={styles.emptyMemory}>正在从本机读取记忆…</p>;
  }

  return (
    <>
      {error ? (
        <p className={styles.emptyMemory} role="alert">
          {error}
        </p>
      ) : null}
      {!memories.length ? (
        <p className={styles.emptyMemory}>
          还没有可见记忆。Agent 不会把推断伪装成你的想法。
        </p>
      ) : (
        <ul className={styles.memoryList}>
          {memories.map((memory) => (
            <li key={memory.id}>
              <div className={styles.memoryMeta}>
                <span data-origin={memory.origin}>
                  {memory.origin === "reader_confirmed"
                    ? "读者确认"
                    : "Agent 观察"}
                </span>
                <span>{memoryKindLabel(memory.kind)}</span>
              </div>
              <p>{memory.text}</p>
              {memory.sourceId ? <code>{memory.sourceId}</code> : null}
              {onRetire ? (
                <button
                  type="button"
                  disabled={retiringId === memory.id}
                  onClick={async () => {
                    setRetiringId(memory.id);
                    try {
                      await onRetire(memory.id);
                      onStatus("这条记忆已删除。");
                    } catch {
                      onStatus("删除失败，原记忆仍然保留。");
                    } finally {
                      setRetiringId(null);
                    }
                  }}
                >
                  {retiringId === memory.id ? "正在删除…" : "删除"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
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

function sourceAtReadingAnchor(reader: HTMLElement): string | null {
  const anchor = window.innerHeight * 0.32;
  let selected: { sourceId: string; distance: number } | null = null;
  for (const block of reader.querySelectorAll<HTMLElement>("[data-source-id]")) {
    const sourceId = block.dataset.sourceId;
    if (!sourceId) continue;
    const bounds = block.getBoundingClientRect();
    if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) continue;
    const distance =
      bounds.top <= anchor && bounds.bottom >= anchor
        ? 0
        : Math.min(Math.abs(bounds.top - anchor), Math.abs(bounds.bottom - anchor));
    if (!selected || distance < selected.distance) {
      selected = { sourceId, distance };
    }
  }
  return selected?.sourceId ?? null;
}

const AGENT_SOURCE_BY_CANONICAL: Readonly<Record<string, string>> = {
  "smith.b1.c1.p1": "smith.b1.c1.division",
  "smith.b1.c3.p1": "smith.b1.c3.market_extent",
};

const CANONICAL_SOURCE_BY_AGENT: Readonly<Record<string, string>> = {
  "smith.b1.c1.division": "smith.b1.c1.p1",
  "smith.b1.c3.market_extent": "smith.b1.c3.p1",
};

function agentSourceIdFor(sourceId: string): string {
  return AGENT_SOURCE_BY_CANONICAL[sourceId] ?? sourceId;
}

function canonicalSourceId(sourceId: string): string {
  return CANONICAL_SOURCE_BY_AGENT[sourceId] ?? sourceId;
}

function chapterIdForSource(sourceId: string): string | null {
  return /^(smith\.b\d+\.c\d+)\./u.exec(sourceId)?.[1] ?? null;
}

function sourceDomId(sourceId: string): string {
  return `source-${sourceId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}
