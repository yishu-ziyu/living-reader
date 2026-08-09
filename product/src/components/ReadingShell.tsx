import {
  collectFootnoteTargetIds,
  getSourceBlockById,
  loadWealthOfNationsBook,
  type Footnote,
  type SourceBlock,
} from "@/modules/book";
import { buildSourceEvidenceMap } from "@/modules/reader-thinking";
import {
  AGENT_OS_STATUS,
  discussionSnapshotFromEvidence,
} from "@/modules/agent-os";
import { CLOSED_WORLD_SLOT } from "@/modules/world";
import { snapshotVoiceSource } from "@/modules/voice";
import { FootnoteList, SourceBody } from "./SourceBody";
import {
  ReaderSessionProvider,
  SessionShellBindings,
} from "./ReaderSessionProvider";
import {
  AgentTurnCompanionLine,
  ReaderThinkingProvider,
} from "./ReaderThinkingProvider";
import {
  ReaderThinkingRailIdeas,
  ReaderThinkingRailRelation,
  ReaderThinkingRailThoughts,
  ThinkingStatusBanner,
} from "./ReaderThinkingPanel";
import { ReaderIdeaComposer } from "./ReaderIdeaComposer";
import { SourceDiscussionComposer } from "./SourceDiscussionComposer";
import { CompanionAnswerCard } from "./CompanionAnswerCard";
import { SoftReturnCard } from "./SoftReturnCard";
import { WorldSlotFromSession } from "./ReadingShellClient";
import { T004SessionBridgeHost } from "@/components/bridge-hosts";
import { RealtimeVoiceDock } from "./RealtimeVoiceDock";
import { VoiceInputProvider } from "./VoiceInputProvider";

/**
 * Formal Chinese reading shell.
 * SourceBlocks come from OLL adapter/manifest — not page constants.
 * T005: ReaderIdea + Relation review wired to EventStore.
 */
export async function ReadingShell() {
  const loaded = await loadWealthOfNationsBook();
  if (!loaded.ok) {
    return (
      <div className="app-shell" data-testid="reading-shell-error">
        <main className="book-main" style={{ padding: 48 }}>
          <h1>来源不可用</h1>
          <p data-testid="source-error-code">{loaded.error.code}</p>
          <p>{loaded.error.message}</p>
        </main>
      </div>
    );
  }

  const division = getSourceBlockById(
    loaded.value.sourceBlocks,
    "smith.b1.c1.division",
  );
  const market = getSourceBlockById(
    loaded.value.sourceBlocks,
    "smith.b1.c3.market_extent",
  );

  if (!division.ok) {
    return (
      <div className="app-shell" data-testid="reading-shell-error">
        <main className="book-main" style={{ padding: 48 }}>
          <h1>来源不可用</h1>
          <p data-testid="source-error-code">{division.error.code}</p>
        </main>
      </div>
    );
  }
  if (!market.ok) {
    return (
      <div className="app-shell" data-testid="reading-shell-error">
        <main className="book-main" style={{ padding: 48 }}>
          <h1>来源不可用</h1>
          <p data-testid="source-error-code">{market.error.code}</p>
        </main>
      </div>
    );
  }

  // F33: seal evidence from live T002 SourceBlocks — never handwritten tables.
  const evidenceMap = buildSourceEvidenceMap(
    [division.value, market.value],
    loaded.value.edition,
  );
  if (!evidenceMap.ok) {
    return (
      <div className="app-shell" data-testid="reading-shell-error">
        <main className="book-main" style={{ padding: 48 }}>
          <h1>来源证据不可用</h1>
          <p data-testid="source-error-code">{evidenceMap.error.code}</p>
          <p>{evidenceMap.error.message}</p>
        </main>
      </div>
    );
  }

  // T006: discussion snapshots = sealed evidence + exact SourceBlock quote.
  const discussionSnapshots = {
    [division.value.sourceId]: discussionSnapshotFromEvidence(
      evidenceMap.value[division.value.sourceId]!,
      division.value.quote,
    ),
    [market.value.sourceId]: discussionSnapshotFromEvidence(
      evidenceMap.value[market.value.sourceId]!,
      market.value.quote,
    ),
  };
  // One server-built sealed snapshot map is shared by text and final voice.
  const voiceSourceSnapshots = {
    [division.value.sourceId]: snapshotVoiceSource(division.value),
    [market.value.sourceId]: snapshotVoiceSource(market.value),
  };

  return (
    <ReaderSessionProvider>
      <VoiceInputProvider>
        <ReaderThinkingProvider
          sourceEvidence={evidenceMap.value}
          discussionSnapshots={discussionSnapshots}
          voiceSourceSnapshots={voiceSourceSnapshots}
        >
          <SessionShellBindings>
          <div className="app-shell" data-testid="reading-shell">
            <aside className="agent-rail" aria-label="Agent OS 阅读栏">
              <div className="rail-brand">
                <div className="brand-seal" aria-hidden="true">
                  ✦
                </div>
                <div>
                  <strong>The Living Reader</strong>
                  <span>鲜活阅读器 · 正式入口</span>
                </div>
              </div>

              <section className="rail-section" aria-labelledby="anchorsTitle">
                <div className="rail-section-title">
                  <span id="anchorsTitle">原文锚点</span>
                  <small>OLL adapter · 两段 SourceBlock</small>
                </div>
                <AnchorCard
                  block={division.value}
                  testId="anchor-division"
                  active
                />
                <AnchorCard block={market.value} testId="anchor-market" />
              </section>

              <section className="rail-section" aria-labelledby="liveTitle">
                <div className="rail-section-title">
                  <span id="liveTitle">实时语音</span>
                  <small>StepFun · Realtime</small>
                </div>
                <RealtimeVoiceDock
                  sources={Object.values(voiceSourceSnapshots)}
                />
              </section>

              <section className="rail-section" aria-labelledby="ideasTitle">
                <div className="rail-section-title">
                  <span id="ideasTitle">已保存 Ideas</span>
                  <small>reader-thinking · EventStore</small>
                </div>
                <ReaderThinkingRailIdeas />
              </section>

              <section className="rail-section" aria-labelledby="thoughtsTitle">
                <div className="rail-section-title">
                  <span id="thoughtsTitle">Agent 思考</span>
                  <small>BookThought · 非读者 Idea</small>
                </div>
                <ReaderThinkingRailThoughts />
              </section>

              <section className="rail-section" aria-labelledby="companionTitle">
                <div className="rail-section-title">
                  <span id="companionTitle">原文讨论</span>
                  <small>Companion · 瞬时候选</small>
                </div>
                <SoftReturnCard />
                <AgentTurnCompanionLine />
                <CompanionAnswerCard />
              </section>

              <section className="rail-section" aria-labelledby="relationTitle">
                <div className="rail-section-title">
                  <span id="relationTitle">确认关系</span>
                  <small>Agent OS · {AGENT_OS_STATUS}</small>
                </div>
                <ReaderThinkingRailRelation />
              </section>

              <div className="rail-foot">
                <span>正式 product · OLL 来源</span>
                <div className="rail-icons" aria-hidden="true">
                  <span>▢</span>
                  <span>⌘</span>
                  <span>◌</span>
                  <span>⚙</span>
                </div>
              </div>
            </aside>

            <main className="book-main" aria-label="语义阅读主区">
              <div className="book-toolbar">
                <span>第一卷 · 第一章 + 第三章</span>
                <span className="toolbar-center">
                  《国富论》· Cannan 第一卷
                </span>
                <div className="toolbar-actions">
                  <span className="toolbar-button is-active">HTML 原文</span>
                  <span className="toolbar-button" data-testid="evidence-status">
                    PDF 证据（未接入）
                  </span>
                </div>
              </div>

              <ThinkingStatusBanner />

              <article className="book-page" id="bookPage">
                <header className="page-masthead">
                  <span className="page-number">
                    {division.value.evidenceRefs[0]?.pdfPage}
                  </span>
                  <div>
                    <span>THE WEALTH OF NATIONS</span>
                    <small>{division.value.chapterLabel}</small>
                  </div>
                  <span className="page-edition">
                    {loaded.value.edition.label} ·{" "}
                    {loaded.value.edition.revision}
                  </span>
                </header>

                <SourceSection
                  block={division.value}
                  footnotes={loaded.value.footnotes}
                  testId="source-block-division"
                />
                <SourceDiscussionComposer
                  sourceId="smith.b1.c1.division"
                  label="分工段"
                />
                <ReaderIdeaComposer
                  sourceId="smith.b1.c1.division"
                  label="分工段"
                />

                <div className="paper-gap">
                  <span>关系确认后，世界在这两段原文之间展开</span>
                </div>

                <WorldSlotFromSession label={CLOSED_WORLD_SLOT.label} />

                <SourceSection
                  block={market.value}
                  footnotes={loaded.value.footnotes}
                  testId="source-block-market"
                />
                <SourceDiscussionComposer
                  sourceId="smith.b1.c3.market_extent"
                  label="市场范围段"
                />
                <ReaderIdeaComposer
                  sourceId="smith.b1.c3.market_extent"
                  label="市场范围段"
                />

                <FootnoteList
                  footnotes={footnotesUsedBy(
                    [division.value, market.value],
                    loaded.value.footnotes,
                  )}
                />
              </article>
            </main>
          </div>
            <T004SessionBridgeHost />
          </SessionShellBindings>
        </ReaderThinkingProvider>
      </VoiceInputProvider>
    </ReaderSessionProvider>
  );
}

function footnotesUsedBy(
  blocks: SourceBlock[],
  all: Footnote[],
): Footnote[] {
  const needed = new Set<string>();
  for (const b of blocks) {
    for (const id of collectFootnoteTargetIds(b.body)) {
      needed.add(id);
    }
  }
  return all.filter((f) => needed.has(f.id));
}

function AnchorCard({
  block,
  testId,
  active,
}: {
  block: SourceBlock;
  testId: string;
  active?: boolean;
}) {
  const pdf = block.evidenceRefs[0]?.pdfPage;
  return (
    <div
      className={`anchor-card${active ? " is-active" : ""}`}
      data-testid={testId}
      data-source-id={block.sourceId}
      data-source-locator={block.sourceLocator.fragment}
    >
      <span className="anchor-icon" aria-hidden="true">
        ▤
      </span>
      <span>
        <strong>
          PDF {pdf} ·{" "}
          {block.sourceKey === "division"
            ? "Division of Labour"
            : "Extent of the Market"}
        </strong>
        <small>{block.glossZh}</small>
        <em>{block.sourceId}</em>
        <em className="locator-line">{block.sourceLocator.fragment}</em>
      </span>
    </div>
  );
}

function SourceSection({
  block,
  footnotes,
  testId,
}: {
  block: SourceBlock;
  footnotes: Footnote[];
  testId: string;
}) {
  const pdf = block.evidenceRefs[0]?.pdfPage;
  const print = block.evidenceRefs[0]?.printPage;
  const Heading = block.readingOrder === 1 ? "h1" : "h2";

  return (
    <section
      id={testId}
      className="source-block"
      data-testid={testId}
      data-source-key={block.sourceKey}
      data-source-id={block.sourceId}
      data-source-locator={block.sourceLocator.fragment}
      data-pdf-page={pdf}
      data-print-page={print}
    >
      <aside className="source-margin-note">
        <span className="margin-kicker">原始来源 · OLL</span>
        <strong data-testid={`${testId}-source-id`}>{block.sourceId}</strong>
        <span data-testid={`${testId}-locator`}>
          {block.sourceLocator.fragment}
        </span>
        <span data-testid={`${testId}-pages`}>
          PDF {pdf}
          {print != null ? ` · OLL p. ${print}` : ""}
        </span>
      </aside>
      <div className="source-text">
        {block.readingOrder === 2 ? (
          <header className="page-masthead bottom-masthead">
            <span className="page-number">{pdf}</span>
            <div>
              <span>THE WEALTH OF NATIONS</span>
              <small>{block.chapterLabel}</small>
            </div>
          </header>
        ) : null}
        <Heading>{block.title}</Heading>
        <p className="source-context">{block.glossZh}</p>
        <blockquote className="quote-block">
          <p data-testid={`${testId}-quote`}>
            <SourceBody body={block.body} footnotes={footnotes} />
          </p>
          <footer>
            逐字引文 · source_id <code>{block.sourceId}</code> · locator{" "}
            <code>{block.sourceLocator.fragment}</code> · Cannan 英文原文
          </footer>
        </blockquote>
      </div>
    </section>
  );
}
