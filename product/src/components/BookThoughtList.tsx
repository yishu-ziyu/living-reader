"use client";

import { useState } from "react";
import { useReaderThinking } from "./ReaderThinkingProvider";

export function BookThoughtList() {
  const thinking = useReaderThinking();
  const active = thinking.activeThoughts;
  const history = thinking.thoughtHistory;
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  if (!thinking.ready) {
    return (
      <p className="rail-empty" data-testid="thought-list-loading">
        加载中…
      </p>
    );
  }

  if (history.length === 0) {
    return (
      <p className="rail-empty" data-testid="thought-list-empty">
        尚无 Agent 思考。提问并保存候选后会出现在这里。
      </p>
    );
  }

  return (
    <div className="thought-list" data-testid="thought-list">
      {active.map((t) => (
        <article
          key={`${t.thought_id}@${t.revision}`}
          className="thought-card"
          data-testid={`thought-card-${t.thought_id}`}
          data-thought-id={t.thought_id}
          data-revision={t.revision}
        >
          <header>
            <strong>Agent 思考 · rev {t.revision}</strong>
            <small data-testid={`thought-source-${t.thought_id}`}>
              {t.source_ids.join(", ")}
            </small>
          </header>
          <p data-testid={`thought-text-${t.thought_id}`}>{t.text}</p>
          <footer>
            <span
              className="idea-badge"
              data-testid={`thought-evidence-${t.thought_id}`}
            >
              {t.evidence_refs.join(", ")} · conf {t.confidence}
              {t.open_question ? ` · Q: ${t.open_question}` : ""}
            </span>
            {editId === t.thought_id ? (
              <div className="idea-edit-row">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={2}
                  data-testid={`thought-edit-input-${t.thought_id}`}
                />
                <button
                  type="button"
                  data-testid={`thought-edit-save-${t.thought_id}`}
                  onClick={async () => {
                    await thinking.reviseBookThought(t.thought_id, editText);
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
                data-testid={`thought-edit-${t.thought_id}`}
                onClick={() => {
                  setEditId(t.thought_id);
                  setEditText(t.text);
                }}
              >
                修改候选
              </button>
            )}
          </footer>
        </article>
      ))}

      {history.some((t) => t.status === "superseded") ? (
        <details className="idea-history" data-testid="thought-history">
          <summary>思考修订历史</summary>
          <ul>
            {history
              .filter((t) => t.status === "superseded")
              .map((t) => (
                <li
                  key={`hist-${t.thought_id}@${t.revision}`}
                  data-testid={`thought-hist-${t.thought_id}-r${t.revision}`}
                >
                  <em>
                    {t.thought_id} · r{t.revision}
                  </em>
                  ：{t.text}
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
