"use client";

import { useState } from "react";
import { useReaderThinking } from "./ReaderThinkingProvider";
import { useVoiceInputPort } from "./VoiceInputProvider";

export function ReaderIdeaComposer({
  sourceId,
  label,
}: {
  sourceId: string;
  label: string;
}) {
  const thinking = useReaderThinking();
  const [text, setText] = useState("");

  return (
    <div
      className="idea-composer"
      data-testid={`idea-composer-${sourceId.includes("division") ? "division" : "market"}`}
      data-source-id={sourceId}
    >
      <label className="idea-composer-label">
        <span>写下你的想法 · {label}</span>
        <textarea
          id={`idea-input-${sourceId.includes("division") ? "division" : "market"}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="读者原话，不会被系统改写"
          data-testid={`idea-input-${sourceId.includes("division") ? "division" : "market"}`}
          disabled={!thinking.ready}
        />
      </label>
      <button
        type="button"
        className="idea-submit"
        data-testid={`idea-submit-${sourceId.includes("division") ? "division" : "market"}`}
        disabled={
          !thinking.ready ||
          !text.trim() ||
          thinking.status.kind === "busy"
        }
        onClick={async () => {
          await thinking.submitIdea(sourceId, text);
          setText("");
        }}
      >
        提交 Idea
      </button>
    </div>
  );
}

export function MarketReplayFixtureButton() {
  const thinking = useReaderThinking();
  const voiceInput = useVoiceInputPort();
  return (
    <button
      type="button"
      className="idea-replay"
      data-testid="market-replay-fixture"
      disabled={!thinking.ready || thinking.status.kind === "busy"}
      onClick={async () => {
        await voiceInput.stopActive("replay");
        await thinking.replayMarketFixture();
      }}
      title="演示输入，非语音"
    >
      演示输入（非语音）· 市场段 Replay
    </button>
  );
}
