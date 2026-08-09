"use client";

import { useRef, useState } from "react";
import type { VoiceFinalTurn, VoiceSourceSnapshot } from "@/modules/voice";
import { useReaderThinking } from "./ReaderThinkingProvider";
import { RealtimeVoicePanel } from "./RealtimeVoicePanel";

export function RealtimeVoiceDock({
  sources,
}: {
  sources: readonly VoiceSourceSnapshot[];
}) {
  const thinking = useReaderThinking();
  const [selectedSourceId, setSelectedSourceId] = useState(
    sources[0]?.sourceId ?? "",
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const submitChainRef = useRef<Promise<void>>(Promise.resolve());
  const selected =
    sources.find((source) => source.sourceId === selectedSourceId) ?? sources[0];

  if (!selected) return null;

  const saveFinalTurn = (turn: VoiceFinalTurn) => {
    submitChainRef.current = submitChainRef.current
      .then(async () => {
        await thinking.submitIdea(
          turn.sourceSnapshot.sourceId,
          turn.transcript,
        );
        setSaveMessage("读者转写已按本轮原文锚点保存为 Idea。");
      })
      .catch(() => {
        setSaveMessage("转写已保留在通话记录中，但保存 Idea 失败，请重试。");
      });
  };

  return (
    <div className="realtime-voice-dock">
      <div className="voice-source-switch" aria-label="选择本轮原文锚点">
        {sources.map((source) => (
          <button
            key={source.sourceId}
            type="button"
            className={source.sourceId === selected.sourceId ? "is-active" : ""}
            aria-pressed={source.sourceId === selected.sourceId}
            onClick={() => {
              setSelectedSourceId(source.sourceId);
              setSaveMessage(null);
            }}
          >
            PDF {source.pdfPages.join("/")} ·{` `}
            {source.sourceId.includes("division") ? "分工" : "市场"}
          </button>
        ))}
      </div>
      <RealtimeVoicePanel
        key={selected.sourceId}
        sourceSnapshot={selected}
        onFinalTurn={saveFinalTurn}
        textFallbackId={
          selected.sourceId.includes("division")
            ? "idea-input-division"
            : "idea-input-market"
        }
      />
      {saveMessage ? (
        <p className="rail-empty voice-save-message" aria-live="polite">
          {saveMessage}
        </p>
      ) : null}
    </div>
  );
}
