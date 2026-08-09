"use client";

import { useState } from "react";
import { classifyIntent } from "@/modules/agent-os";
import { useReaderThinking } from "./ReaderThinkingProvider";
import { useVoiceInputPort } from "./VoiceInputProvider";

export function SourceDiscussionComposer({
  sourceId,
  label,
}: {
  sourceId: string;
  label: string;
}) {
  const thinking = useReaderThinking();
  const voiceInput = useVoiceInputPort();
  const [question, setQuestion] = useState("");
  const short =
    sourceId.includes("division") ? "division" : "market";

  const submitFinalText = async (text: string) => {
    const control = classifyIntent(text);
    if (control.intent === "explicit_stop") {
      // Calling the facade first synchronously invalidates any in-flight turn;
      // the microphone still releases before that queued Stop pauses session.
      const stopTurn = thinking.submitAgentTurn({
        sourceId,
        channel: "text",
        final_text: text,
        turn_id: crypto.randomUUID(),
      });
      await voiceInput.stopActive("user");
      await stopTurn;
      return;
    }
    if (
      control.intent === "continue" ||
      control.intent === "decline_return"
    ) {
      await thinking.submitBoundaryInput(sourceId, text);
      return;
    }
    await thinking.submitAgentTurn({
      sourceId,
      channel: "text",
      final_text: text,
      turn_id: crypto.randomUUID(),
    });
  };

  return (
    <div
      className="source-discussion"
      data-testid={`source-discussion-${short}`}
      data-source-id={sourceId}
    >
      <label className="idea-composer-label">
        <span>向陪读提问 · {label}</span>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          placeholder={
            short === "division"
              ? "例如：分工会让人更熟练吗？ / 明天天气怎么样"
              : "例如：市场范围如何限制分工？"
          }
          data-testid={`discussion-input-${short}`}
          disabled={!thinking.ready || thinking.status.kind === "busy"}
        />
      </label>
      <div className="discussion-actions">
        <button
          type="button"
          className="idea-submit"
          data-testid={`discussion-ask-${short}`}
          disabled={
            !thinking.ready ||
            !question.trim() ||
            thinking.status.kind === "busy"
          }
          onClick={async () => {
            const text = question;
            // Clear raw input immediately — never persist off-topic text.
            setQuestion("");
            await submitFinalText(text);
          }}
        >
          提问
        </button>
        <button
          type="button"
          className="idea-secondary"
          data-testid={`discussion-stop-${short}`}
          disabled={!thinking.ready}
          onClick={async () => {
            setQuestion("");
            await submitFinalText("停止");
          }}
        >
          停止
        </button>
        <button
          type="button"
          className="idea-secondary"
          data-testid={`discussion-continue-${short}`}
          disabled={!thinking.ready || thinking.status.kind === "busy"}
          onClick={async () => {
            setQuestion("");
            await submitFinalText("继续");
          }}
        >
          继续
        </button>
      </div>
      <p
        className="session-state-hint"
        data-testid={`session-state-${short}`}
        data-session-state={thinking.sessionState}
      >
        session: {thinking.sessionState}
        {thinking.boundary.soft_return_declined ? " · 已关闭回引" : ""}
      </p>
    </div>
  );
}
