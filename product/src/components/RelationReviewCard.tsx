"use client";

import { useState } from "react";
import { useReaderThinking } from "./ReaderThinkingProvider";

export function RelationReviewCard() {
  const thinking = useReaderThinking();
  const [corrections, setCorrections] = useState("");
  const rel = thinking.currentRelation;

  if (!thinking.ready) {
    return (
      <p className="rail-empty" data-testid="relation-loading">
        加载中…
      </p>
    );
  }

  if (!rel) {
    return (
      <div className="relation-proposal" data-testid="relation-empty">
        <strong>尚无关系提议</strong>
        <span>
          在分工段与市场范围段各提交一条 Idea 后，将出现 constrained_by 提议。
        </span>
        {thinking.canPropose ? (
          <button
            type="button"
            data-testid="relation-propose"
            onClick={() => thinking.proposeRelation()}
          >
            生成关系提议
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="relation-proposal"
      data-testid="relation-card"
      data-relation-id={rel.relation_id}
      data-review-status={rel.review_status}
      data-stale={rel.stale ? "true" : "false"}
      data-proposal-revision={rel.proposal_revision}
      data-basis-revision={rel.basis_revision}
    >
      <strong>专业化受市场范围限制。</strong>
      <span>
        {rel.relation_type} · {rel.from_id} → {rel.to_id}
      </span>
      <span data-testid="relation-status">
        状态：{rel.review_status}
        {rel.stale ? " · 已过期（需重新确认）" : ""}
        {thinking.graph.graph_stale ? " · 图已 stale" : ""}
      </span>
      <span data-testid="relation-revisions">
        basis {rel.basis_revision} · proposal_rev {rel.proposal_revision} · graph{" "}
        {thinking.graph.graph_revision}
      </span>
      <span className="idea-badge" data-testid="relation-needs-review">
        证据 {rel.evidence_refs.join(", ")}
        {rel.review_status === "proposed"
          ? " · needs_review"
          : rel.review_status === "accepted"
            ? " · accepted"
            : ` · ${rel.review_status}`}
      </span>
      {rel.review_history.length > 0 ? (
        <details data-testid="relation-history">
          <summary>关系修订历史 ({rel.review_history.length})</summary>
          <ul>
            {rel.review_history.map((h, i) => (
              <li key={`${h.decision}-${h.proposal_revision}-${i}`}>
                {h.decision} · basis {h.basis_revision} · p{h.proposal_revision}
                {h.corrections ? ` · ${h.corrections}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {rel.review_status === "proposed" && !rel.stale ? (
        <div className="relation-actions">
          <textarea
            placeholder="修改说明（可选）"
            value={corrections}
            onChange={(e) => setCorrections(e.target.value)}
            rows={2}
            data-testid="relation-corrections-input"
            disabled={thinking.status.kind === "busy"}
          />
          <button
            type="button"
            data-testid="relation-revise"
            disabled={thinking.status.kind === "busy"}
            onClick={() => thinking.reviseRelation(corrections)}
          >
            修改
          </button>
          <button
            type="button"
            data-testid="relation-reject"
            disabled={thinking.status.kind === "busy"}
            onClick={() => thinking.rejectRelation()}
          >
            拒绝
          </button>
          <button
            type="button"
            data-testid="relation-accept"
            disabled={thinking.status.kind === "busy"}
            onClick={() => thinking.acceptRelation()}
          >
            确认
          </button>
        </div>
      ) : null}

      {rel.review_status === "accepted" && !rel.stale ? (
        <span data-testid="relation-accepted-badge">已确认 · 无需再审</span>
      ) : null}

      {(rel.review_status === "rejected" || rel.stale) && (
        <button
          type="button"
          data-testid="relation-repropose"
          disabled={thinking.status.kind === "busy"}
          onClick={() => thinking.reproposeRelation()}
        >
          手动重新提议
        </button>
      )}

      {thinking.status.message ? (
        <p
          className={`thinking-status is-${thinking.status.kind}`}
          data-testid="thinking-status"
          data-code={thinking.status.code ?? ""}
        >
          {thinking.status.message}
        </p>
      ) : null}
    </div>
  );
}
