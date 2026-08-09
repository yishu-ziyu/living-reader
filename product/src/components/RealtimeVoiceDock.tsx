"use client";

import { useRef, useState } from "react";
import type { VoiceFinalTurn, VoiceSourceSnapshot } from "@/modules/voice";
import { useReaderThinking } from "./ReaderThinkingProvider";
import { RealtimeVoicePanel } from "./RealtimeVoicePanel";
import { useVoiceInputPort } from "./VoiceInputProvider";

export function RealtimeVoiceDock({
  sources,
}: {
  sources: readonly VoiceSourceSnapshot[];
}) {
  const thinking = useReaderThinking();
  const voiceInput = useVoiceInputPort();
  const [selectedSourceId, setSelectedSourceId] = useState(
    sources[0]?.sourceId ?? "",
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const submitChainRef = useRef<Promise<void>>(Promise.resolve());
  const sourceGenerationRef = useRef(0);
  const sourceSwitchingRef = useRef(false);
  const selectedSourceIdRef = useRef(selectedSourceId);
  const selected =
    sources.find((source) => source.sourceId === selectedSourceId) ?? sources[0];

  if (!selected) return null;

  const submitFinalTurn = (turn: VoiceFinalTurn) => {
    const generation = sourceGenerationRef.current;
    submitChainRef.current = submitChainRef.current
      .then(async () => {
        if (
          sourceSwitchingRef.current ||
          generation !== sourceGenerationRef.current ||
          selectedSourceIdRef.current !== turn.sourceSnapshot.sourceId
        ) {
          setSaveMessage("原文锚点已切换，这一句请在当前段重新说。");
          return;
        }
        await thinking.submitAgentTurn({
          sourceId: turn.sourceSnapshot.sourceId,
          channel: "voice",
          final_text: turn.transcript,
          turn_id: turn.turn_id,
          ...(turn.asr_confidence === undefined
            ? {}
            : { asr_confidence: turn.asr_confidence }),
        });
      })
      .catch(() => {
        setSaveMessage("这句转写暂时没接稳，世界先不动。可以改用下方文字提问。");
      });
  };

  const stopSemanticTurn = () => {
    // Fence every queued voice final before the Stop waits behind an in-flight
    // AgentTurn. ReaderThinking performs the matching semantic generation fence.
    sourceGenerationRef.current += 1;
    return thinking
      .submitAgentTurn({
        sourceId: selected.sourceId,
        channel: "voice",
        final_text: "停止",
        turn_id: `voice-control:${crypto.randomUUID()}`,
      })
      .then(() => undefined);
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
            onClick={async () => {
              sourceSwitchingRef.current = true;
              try {
                await voiceInput.stopActive("source_change");
              } finally {
                // Only after the old session is fenced may a new source accept
                // final turns. Queued old finals carry the old generation.
                sourceGenerationRef.current += 1;
                selectedSourceIdRef.current = source.sourceId;
                setSelectedSourceId(source.sourceId);
                setSaveMessage(null);
                sourceSwitchingRef.current = false;
              }
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
        onFinalTurn={submitFinalTurn}
        onStop={stopSemanticTurn}
        textFallbackId={
          selected.sourceId.includes("division")
            ? "discussion-input-division"
            : "discussion-input-market"
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
