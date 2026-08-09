"use client";

import { useState } from "react";
import { classifyIntent } from "@/modules/agent-os";
import { useReaderThinking } from "./ReaderThinkingProvider";
import { useVoiceInputPort } from "./VoiceInputProvider";

const LEGACY_TEST_SUFFIX_BY_SOURCE_ID: Readonly<Record<string, string>> = {
  "smith.b1.c1.division": "division",
  "smith.b1.c3.market_extent": "market",
};

export function sourceTestSuffix(sourceId: string): string {
  return (
    LEGACY_TEST_SUFFIX_BY_SOURCE_ID[sourceId] ??
    sourceId.replace(/[^a-zA-Z0-9_-]/g, "-")
  );
}

export function SourceDiscussionComposer({
  sourceId,
  label,
  showStatus = true,
}: {
  sourceId: string;
  label: string;
  showStatus?: boolean;
}) {
  const thinking = useReaderThinking();
  const voiceInput = useVoiceInputPort();
  const [question, setQuestion] = useState("");
  const testSuffix = sourceTestSuffix(sourceId);

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
      data-testid={`source-discussion-${testSuffix}`}
      data-source-id={sourceId}
    >
      <label className="idea-composer-label">
        <span>向陪读提问 · {label}</span>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          placeholder={
            testSuffix === "division"
              ? "例如：分工会让人更熟练吗？ / 明天天气怎么样"
              : testSuffix === "market"
                ? "例如：市场范围如何限制分工？"
                : "例如：这段原文的关键判断是什么？"
          }
          data-testid={`discussion-input-${testSuffix}`}
          disabled={!thinking.ready || thinking.status.kind === "busy"}
        />
      </label>
      <div className="discussion-actions">
        <button
          type="button"
          className="idea-submit"
          data-testid={`discussion-ask-${testSuffix}`}
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
          data-testid={`discussion-stop-${testSuffix}`}
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
          data-testid={`discussion-continue-${testSuffix}`}
          disabled={!thinking.ready || thinking.status.kind === "busy"}
          onClick={async () => {
            setQuestion("");
            await submitFinalText("继续");
          }}
        >
          继续
        </button>
      </div>
      {showStatus ? (
        <p
          className="session-state-hint"
          data-testid={`session-state-${testSuffix}`}
          data-session-state={thinking.sessionState}
        >
          session: {thinking.sessionState}
          {thinking.boundary.soft_return_declined ? " · 已关闭回引" : ""}
        </p>
      ) : null}
    </div>
  );
}
