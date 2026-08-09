"use client";

import { useEffect, useRef, useState } from "react";
import {
  acceptReaderTranscriptItem,
  base64ToPcm16,
  cloneVoiceSourceSnapshot,
  downsampleToPcm16,
  pcm16ToBase64,
  STEPFUN_PCM_SAMPLE_RATE,
  type VoiceBrowserEvent,
  type VoiceFinalTurn,
  type VoiceSourceSnapshot,
  type VoiceTranscript,
} from "@/modules/voice";

type VoiceUiState =
  | "idle"
  | "requesting_permission"
  | "connecting"
  | "listening"
  | "stopping"
  | "stopped"
  | "denied"
  | "unsupported"
  | "error";

type RealtimeVoicePanelProps = {
  sourceSnapshot: VoiceSourceSnapshot;
  onFinalTurn?: (turn: VoiceFinalTurn) => void;
  textFallbackId?: string;
};

type SessionResponse = {
  ok?: boolean;
  session?: { id?: string };
  error?: { message?: string };
};

const STATE_LABELS: Record<VoiceUiState, string> = {
  idle: "尚未开始",
  requesting_permission: "等待麦克风权限",
  connecting: "正在连接阶跃",
  listening: "正在聆听",
  stopping: "正在停止",
  stopped: "已停止",
  denied: "麦克风权限被拒绝",
  unsupported: "当前浏览器不支持",
  error: "连接失败",
};

function appendFinalTranscript(
  previous: VoiceTranscript[],
  transcript: VoiceTranscript,
) {
  const withoutDuplicate = previous.filter((item) => item.id !== transcript.id);
  return [...withoutDuplicate, transcript].slice(-8);
}

async function readApiMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as SessionResponse;
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export function RealtimeVoicePanel({
  sourceSnapshot,
  onFinalTurn,
  textFallbackId,
}: RealtimeVoicePanelProps) {
  const [state, setState] = useState<VoiceUiState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [readerProgress, setReaderProgress] = useState("");
  const [companionPartial, setCompanionPartial] = useState("");
  const [transcripts, setTranscripts] = useState<VoiceTranscript[]>([]);

  const stateRef = useRef<VoiceUiState>("idle");
  const sessionIdRef = useRef<string | null>(null);
  const sourceAtStartRef = useRef<VoiceSourceSnapshot | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve());
  const playbackTimeRef = useRef(0);
  const playbackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const assistantRef = useRef<{
    itemId: string;
    mode: "audio" | "text";
    text: string;
  } | null>(null);
  const finalTurnHandlerRef = useRef(onFinalTurn);
  const processedReaderItemIdsRef = useRef<Set<string>>(new Set());
  const startAttemptRef = useRef(0);

  useEffect(() => {
    finalTurnHandlerRef.current = onFinalTurn;
  }, [onFinalTurn]);

  const transition = (next: VoiceUiState) => {
    stateRef.current = next;
    setState(next);
  };

  const stopPlayback = () => {
    for (const source of playbackSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // A source that already ended cannot be stopped twice.
      }
    }
    playbackSourcesRef.current.clear();
    playbackTimeRef.current = 0;
  };

  const cleanupLocalMedia = async () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    mediaSourceRef.current?.disconnect();
    mediaSourceRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    stopPlayback();
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") await context.close();
  };

  const stopRemoteSession = async () => {
    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    if (!sessionId) return;
    try {
      await fetch(`/api/voice/session/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
    } catch {
      // Local tracks still stop even if the remote close request cannot complete.
    }
  };

  useEffect(() => {
    return () => {
      startAttemptRef.current += 1;
      eventSourceRef.current?.close();
      processorRef.current?.disconnect();
      mediaSourceRef.current?.disconnect();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      stopPlayback();
      const context = audioContextRef.current;
      if (context && context.state !== "closed") void context.close();
      const sessionId = sessionIdRef.current;
      if (sessionId) {
        void fetch(`/api/voice/session/${encodeURIComponent(sessionId)}`, {
          method: "DELETE",
          keepalive: true,
        });
      }
    };
  }, []);

  const sendCommand = async (command: object) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) throw new Error("实时语音会话尚未建立。");
    const response = await fetch(
      `/api/voice/session/${encodeURIComponent(sessionId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      },
    );
    if (!response.ok) {
      throw new Error(await readApiMessage(response, "音频发送失败。"));
    }
  };

  const failActiveSession = async (errorMessage: string) => {
    if (stateRef.current === "stopping" || stateRef.current === "stopped") return;
    transition("error");
    setMessage(errorMessage);
    await Promise.all([cleanupLocalMedia(), stopRemoteSession()]);
  };

  const playAudioDelta = (encoded: string) => {
    const context = audioContextRef.current;
    if (!context || context.state === "closed") return;
    const samples = base64ToPcm16(encoded);
    if (samples.length === 0) return;
    const buffer = context.createBuffer(
      1,
      samples.length,
      STEPFUN_PCM_SAMPLE_RATE,
    );
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      channel[index] = (samples[index] ?? 0) / 0x8000;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime, playbackTimeRef.current);
    source.start(startAt);
    playbackTimeRef.current = startAt + buffer.duration;
    playbackSourcesRef.current.add(source);
    source.onended = () => playbackSourcesRef.current.delete(source);
  };

  const handleBrowserEvent = (event: VoiceBrowserEvent) => {
    switch (event.type) {
      case "reader.speech_started":
        setReaderProgress("正在识别你的话…");
        return;
      case "reader.speech_stopped":
        setReaderProgress("正在完成转写…");
        return;
      case "reader.transcript_final": {
        setReaderProgress("");
        const id = event.itemId ?? crypto.randomUUID();
        if (!acceptReaderTranscriptItem(processedReaderItemIdsRef.current, id)) {
          return;
        }
        setTranscripts((previous) =>
          appendFinalTranscript(previous, {
            id: `reader-${id}`,
            role: "reader",
            text: event.text,
            final: true,
          }),
        );
        const fixedSource = sourceAtStartRef.current;
        if (fixedSource) {
          finalTurnHandlerRef.current?.({
            transcript: event.text,
            sourceSnapshot: fixedSource,
            input: "voice",
          });
        }
        return;
      }
      case "companion.transcript_partial": {
        const itemId = event.itemId ?? "current";
        const current = assistantRef.current;
        if (
          !current ||
          current.itemId !== itemId ||
          (event.mode === "audio" && current.mode === "text")
        ) {
          assistantRef.current = { itemId, mode: event.mode, text: event.text };
        } else if (current.mode === event.mode) {
          current.text += event.text;
        }
        setCompanionPartial(assistantRef.current?.text ?? "");
        return;
      }
      case "companion.transcript_final": {
        const itemId = event.itemId ?? "current";
        const current = assistantRef.current;
        if (event.mode === "text" && current?.mode === "audio") return;
        assistantRef.current = null;
        setCompanionPartial("");
        setTranscripts((previous) =>
          appendFinalTranscript(previous, {
            id: `companion-${itemId}`,
            role: "companion",
            text: event.text,
            final: true,
          }),
        );
        return;
      }
      case "companion.audio_delta":
        playAudioDelta(event.audio);
        return;
      case "companion.response_done":
        if (event.status === "failed") {
          void failActiveSession("阶跃未能生成本轮回复，请重试。");
        }
        return;
      case "voice.error":
        void failActiveSession(event.message);
        return;
      case "voice.closed":
        if (stateRef.current !== "stopping" && stateRef.current !== "error") {
          transition("stopped");
          setMessage(event.reason);
          void cleanupLocalMedia();
        }
    }
  };

  const start = async () => {
    const startAttempt = (startAttemptRef.current += 1);
    uploadChainRef.current = Promise.resolve();
    setMessage(null);
    setReaderProgress("");
    setCompanionPartial("");
    assistantRef.current = null;
    processedReaderItemIdsRef.current.clear();

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof AudioContext === "undefined" ||
      typeof EventSource === "undefined"
    ) {
      transition("unsupported");
      setMessage("此浏览器缺少麦克风或实时事件能力，请使用文字输入。");
      return;
    }

    sourceAtStartRef.current = cloneVoiceSourceSnapshot(sourceSnapshot);
    transition("requesting_permission");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        transition("denied");
        setMessage("未获得麦克风权限。你可以修改浏览器权限后重试，或继续打字。");
      } else {
        transition("error");
        setMessage("无法打开麦克风，请检查设备后重试。");
      }
      return;
    }

    if (startAttempt !== startAttemptRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    mediaStreamRef.current = stream;
    const context = new AudioContext();
    audioContextRef.current = context;
    try {
      await context.resume();
      transition("connecting");
      const response = await fetch("/api/voice/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceSnapshot: sourceAtStartRef.current }),
      });
      const body = (await response.json()) as SessionResponse;
      const sessionId = body.session?.id;
      if (!response.ok || !body.ok || !sessionId) {
        throw new Error(body.error?.message ?? "无法建立阶跃实时语音连接。");
      }
      sessionIdRef.current = sessionId;
      if (startAttempt !== startAttemptRef.current) {
        await Promise.all([cleanupLocalMedia(), stopRemoteSession()]);
        return;
      }

      const events = new EventSource(
        `/api/voice/session/${encodeURIComponent(sessionId)}/events`,
      );
      eventSourceRef.current = events;
      events.addEventListener("voice", (rawEvent) => {
        try {
          handleBrowserEvent(
            JSON.parse((rawEvent as MessageEvent<string>).data) as VoiceBrowserEvent,
          );
        } catch {
          void failActiveSession("收到无法识别的实时语音事件，请重试。");
        }
      });
      events.onerror = () => {
        if (stateRef.current === "listening") {
          void failActiveSession("实时语音事件连接中断，请重试。");
        }
      };

      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      mediaSourceRef.current = source;
      processorRef.current = processor;
      source.connect(processor);
      processor.connect(context.destination);
      processor.onaudioprocess = (audioEvent) => {
        if (stateRef.current !== "listening") return;
        const pcm = downsampleToPcm16(
          audioEvent.inputBuffer.getChannelData(0),
          context.sampleRate,
        );
        const audio = pcm16ToBase64(pcm);
        uploadChainRef.current = uploadChainRef.current
          .then(() => sendCommand({ type: "input_audio_buffer.append", audio }))
          .catch((error: unknown) => {
            const errorMessage =
              error instanceof Error ? error.message : "音频发送失败。";
            return failActiveSession(errorMessage);
          });
      };
      transition("listening");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "无法建立阶跃实时语音连接。";
      transition("error");
      setMessage(errorMessage);
      await Promise.all([cleanupLocalMedia(), stopRemoteSession()]);
    }
  };

  const stop = async () => {
    startAttemptRef.current += 1;
    transition("stopping");
    setMessage(null);
    await uploadChainRef.current;
    await Promise.all([cleanupLocalMedia(), stopRemoteSession()]);
    transition("stopped");
    setMessage("通话已停止，麦克风已释放。");
  };

  const cancelResponse = async () => {
    stopPlayback();
    try {
      await sendCommand({ type: "response.cancel" });
      await sendCommand({ type: "input_audio_buffer.clear" });
      setMessage("已取消当前回复，仍在聆听。你可以继续说话。");
    } catch (error) {
      await failActiveSession(
        error instanceof Error ? error.message : "取消当前回复失败。",
      );
    }
  };

  const canStart =
    state === "idle" ||
    state === "stopped" ||
    state === "denied" ||
    state === "unsupported" ||
    state === "error";

  return (
    <div className="realtime-voice" data-testid="realtime-voice-panel">
      <p className="rail-empty" data-testid="voice-purpose">
        点击后才会请求麦克风，用于围绕当前原文与陪读实时交谈；停止后立即释放麦克风。
      </p>
      <p className="rail-empty" data-testid="voice-source-snapshot">
        本轮锚点：{sourceSnapshot.title} · PDF {sourceSnapshot.pdfPages.join("、")}
      </p>
      <div className="voice-actions">
        {canStart ? (
          <button
            type="button"
            className="idea-submit"
            onClick={() => void start()}
            data-testid="voice-start"
          >
            {state === "idle" ? "开始实时语音" : "重试实时语音"}
          </button>
        ) : (
          <button
            type="button"
            className="idea-submit"
            onClick={() => void stop()}
            disabled={state !== "listening" && state !== "connecting"}
            data-testid="voice-stop"
          >
            停止通话
          </button>
        )}
        {state === "listening" ? (
          <button
            type="button"
            className="idea-replay"
            onClick={() => void cancelResponse()}
            data-testid="voice-cancel"
          >
            取消当前回复
          </button>
        ) : null}
      </div>
      <p className="rail-empty" aria-live="polite" data-testid="voice-state">
        状态：{STATE_LABELS[state]}
        {message ? ` · ${message}` : ""}
      </p>
      {readerProgress ? (
        <p className="rail-empty" aria-live="polite" data-testid="voice-reader-partial">
          你：{readerProgress}
        </p>
      ) : null}
      {companionPartial ? (
        <p
          className="rail-empty"
          aria-live="polite"
          data-testid="voice-companion-partial"
        >
          陪读（生成中）：{companionPartial}
        </p>
      ) : null}
      {transcripts.length > 0 ? (
        <ol className="voice-transcripts" aria-label="实时语音转写">
          {transcripts.map((transcript) => (
            <li key={transcript.id} data-role={transcript.role}>
              <strong>{transcript.role === "reader" ? "你" : "陪读"}：</strong>
              {transcript.text}
            </li>
          ))}
        </ol>
      ) : null}
      <p className="rail-empty">
        语音不可用时，仍可使用页面中的
        {textFallbackId ? <a href={`#${textFallbackId}`}>文字提问</a> : "文字提问"}
        ，不会生成假语音结果。
      </p>
    </div>
  );
}
