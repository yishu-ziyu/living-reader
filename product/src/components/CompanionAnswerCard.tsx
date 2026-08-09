"use client";

import { useState } from "react";
import type { BookThoughtCandidate } from "@/modules/agent-os";
import { useReaderThinking } from "./ReaderThinkingProvider";

/**
 * Outer shell: remounts inner draft state when candidate_id changes
 * so abandoned draftInference never leaks into the next ask (F-T006-1).
 */
export function CompanionAnswerCard() {
  const thinking = useReaderThinking();
  const cand = thinking.candidate;

  if (!cand) {
    return (
      <p className="rail-empty" data-testid="companion-empty">
        针对当前原文提问后，将显示陪读回答与 Agent 思考候选。
      </p>
    );
  }

  return (
    <CompanionAnswerCardInner
      key={cand.candidate_id}
      cand={cand}
    />
  );
}

function CompanionAnswerCardInner({ cand }: { cand: BookThoughtCandidate }) {
  const thinking = useReaderThinking();
  // Fresh state per candidate_id (key on parent).
  const [draftInference, setDraftInference] = useState(cand.inference_zh);

  return (
    <div
      className="companion-card"
      data-testid="companion-answer-card"
      data-candidate-id={cand.candidate_id}
      data-stale={cand.stale ? "true" : "false"}
      data-source-id={cand.source_snapshot.source_id}
    >
      <strong>陪读回答（瞬时，未写入事件）</strong>
      <p data-testid="companion-answer-zh">{cand.answer_zh}</p>

      <div className="companion-columns">
        <section data-testid="companion-quote-panel">
          <h4>原文摘录</h4>
          <blockquote lang="en">{cand.quote_exact}</blockquote>
          <small data-testid="companion-source-meta">
            {cand.source_snapshot.source_id} ·{" "}
            {cand.source_snapshot.fragment} · PDF
            {cand.source_snapshot.pdf_page}/print
            {cand.source_snapshot.print_page}
          </small>
        </section>
        <section data-testid="companion-inference-panel">
          <h4>陪读解释 / 推断</h4>
          <textarea
            value={draftInference}
            onChange={(e) => setDraftInference(e.target.value)}
            rows={4}
            data-testid="companion-inference-edit"
            disabled={cand.stale || thinking.status.kind === "busy"}
          />
          <small>
            confidence {(cand.confidence * 100).toFixed(0)}%
            {cand.open_question
              ? ` · 开放问题：${cand.open_question}`
              : ""}
          </small>
        </section>
        <section data-testid="companion-candidate-panel">
          <h4>Agent 的思考候选</h4>
          <p>保存后成为 BookThought，不会写入「我的 Idea」。</p>
          <span className="idea-badge" data-testid="companion-evidence">
            {cand.evidence_refs.join(", ")}
          </span>
        </section>
      </div>

      {cand.stale ? (
        <p className="thinking-banner is-error" data-testid="companion-stale">
          来源已切换，候选已过期，不能保存。
        </p>
      ) : (
        <div className="companion-actions">
          <button
            type="button"
            data-testid="companion-save"
            disabled={thinking.status.kind === "busy"}
            onClick={() =>
              thinking.acceptBookThoughtCandidate(draftInference)
            }
          >
            保存为 Agent 思考
          </button>
          <button
            type="button"
            data-testid="companion-reject"
            disabled={thinking.status.kind === "busy"}
            onClick={() => thinking.rejectBookThoughtCandidate()}
          >
            不保存
          </button>
        </div>
      )}
    </div>
  );
}
