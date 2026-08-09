"use client";

import { useState } from "react";
import { useReaderThinking } from "./ReaderThinkingProvider";

export function ReaderIdeaList() {
  const thinking = useReaderThinking();
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const active = thinking.activeIdeas;
  const history = thinking.ideaHistory;

  if (!thinking.ready) {
    return (
      <p className="rail-empty" data-testid="idea-list-loading">
        加载中…
      </p>
    );
  }

  if (history.length === 0) {
    return (
      <p className="rail-empty" data-testid="idea-list-empty">
        尚无 ReaderIdea。在正文旁写下你的想法。
      </p>
    );
  }

  return (
    <div className="idea-list" data-testid="idea-list">
      {active.map((idea) => (
        <article
          key={`${idea.idea_id}@${idea.revision}`}
          className="idea-card"
          data-testid={`idea-card-${idea.idea_id}`}
          data-idea-id={idea.idea_id}
          data-revision={idea.revision}
          data-source-id={idea.source_ids[0]}
        >
          <header>
            <strong>rev {idea.revision}</strong>
            <small data-testid={`idea-source-${idea.idea_id}`}>
              {idea.source_ids.join(", ")}
            </small>
          </header>
          <p data-testid={`idea-text-${idea.idea_id}`}>{idea.text}</p>
          <footer>
            <span
              className="idea-badge"
              data-testid={`idea-evidence-${idea.idea_id}`}
            >
              证据 {idea.evidence_refs.join(", ") || "—"}
            </span>
            {editId === idea.idea_id ? (
              <div className="idea-edit-row">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={2}
                  data-testid={`idea-edit-input-${idea.idea_id}`}
                />
                <button
                  type="button"
                  data-testid={`idea-edit-save-${idea.idea_id}`}
                  onClick={async () => {
                    await thinking.reviseIdea(idea.idea_id, editText);
                    setEditId(null);
                  }}
                >
                  保存修订
                </button>
                <button type="button" onClick={() => setEditId(null)}>
                  取消
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-testid={`idea-edit-${idea.idea_id}`}
                onClick={() => {
                  setEditId(idea.idea_id);
                  setEditText(idea.text);
                }}
              >
                编辑
              </button>
            )}
          </footer>
        </article>
      ))}

      {history.some((i) => i.status === "superseded") ? (
        <details className="idea-history" data-testid="idea-history">
          <summary>修订历史</summary>
          <ul>
            {history
              .filter((i) => i.status === "superseded")
              .map((idea) => (
                <li
                  key={`hist-${idea.idea_id}@${idea.revision}`}
                  data-testid={`idea-hist-${idea.idea_id}-r${idea.revision}`}
                  data-status="superseded"
                >
                  <em>
                    {idea.idea_id} · r{idea.revision}
                  </em>
                  ：{idea.text}
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
