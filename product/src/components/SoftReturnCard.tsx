"use client";

import { useReaderThinking } from "./ReaderThinkingProvider";

/**
 * T007 soft-return UI: ≤3 Chinese lines, exactly one CTA, decline control.
 * No quote / evidence / source binding.
 */
export function SoftReturnCard() {
  const thinking = useReaderThinking();
  const soft = thinking.boundary.soft_return;
  const clarification = thinking.boundary.clarification;
  const hint = thinking.boundary.status_hint;

  if (soft) {
    return (
      <div
        className="soft-return-card"
        data-testid="soft-return-card"
        data-turn-id={soft.turn_id}
        role="status"
        aria-live="polite"
      >
        <strong>温和回引</strong>
        <ul data-testid="soft-return-lines">
          {soft.lines.map((line, i) => (
            <li key={i} data-testid={`soft-return-line-${i}`}>
              {line}
            </li>
          ))}
        </ul>
        <p className="soft-return-meta" data-testid="soft-return-no-evidence">
          无原文摘录 · 无 evidence · source_ids=[]
        </p>
        <div className="soft-return-actions">
          <button
            type="button"
            className="idea-submit"
            data-testid="soft-return-cta"
            onClick={() => thinking.dismissSoftReturn()}
          >
            {soft.cta_label}
          </button>
          <button
            type="button"
            className="idea-secondary"
            data-testid="soft-return-decline"
            onClick={() => thinking.declineSoftReturn()}
          >
            不用了
          </button>
        </div>
      </div>
    );
  }

  if (clarification) {
    return (
      <p
        className="soft-return-clarify"
        data-testid="boundary-clarification"
        role="status"
      >
        {clarification}
      </p>
    );
  }

  if (hint) {
    return (
      <p
        className="soft-return-hint"
        data-testid="boundary-status-hint"
        role="status"
      >
        {hint}
      </p>
    );
  }

  return null;
}
