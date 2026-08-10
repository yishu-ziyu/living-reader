import type { VoiceSourceSnapshot } from "./contracts";

export const STEPFUN_REALTIME_URL =
  "wss://api.stepfun.com/step_plan/v1/realtime?model=stepaudio-2.5-realtime";

const MAX_PROVIDER_ID_LENGTH = 80;
const MAX_TRANSCRIPT_LENGTH = 20_000;
const MAX_AUDIO_CHUNK_LENGTH = 350_000;

const RESPONSE_STATUSES = new Set<VoiceResponseStatus>([
  "completed",
  "cancelled",
  "failed",
  "incomplete",
]);

export type VoiceResponseStatus =
  | "completed"
  | "cancelled"
  | "failed"
  | "incomplete";

export type VoiceClientCommand =
  | { type: "input_audio_buffer.append"; audio: string }
  | { type: "input_audio_buffer.clear" }
  | { type: "input_audio_buffer.commit" }
  | { type: "response.create" }
  | { type: "response.cancel" };

export type VoiceBrowserEvent =
  | { type: "reader.speech_started"; itemId: string }
  | { type: "reader.speech_stopped"; itemId: string }
  | { type: "reader.transcript_final"; itemId: string; text: string }
  | {
      type: "companion.transcript_partial";
      itemId: string;
      text: string;
      mode: "audio" | "text";
    }
  | {
      type: "companion.transcript_final";
      itemId: string;
      text: string;
      mode: "audio" | "text";
    }
  | { type: "companion.audio_delta"; audio: string }
  | { type: "companion.response_done"; status: VoiceResponseStatus }
  | { type: "voice.error"; code?: string; message: string }
  | { type: "voice.closed"; reason: string };

export type StepFunClientEvent = VoiceClientCommand & { event_id: string };

export type StepFunSessionLifecycleEvent = Readonly<{
  type: "session.created" | "session.updated";
  eventId: string;
}>;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalBoundedString(
  record: UnknownRecord,
  key: string,
  maxLength: number,
): string | undefined {
  const value = record[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : undefined;
}

function requiredTrimmedString(
  record: UnknownRecord,
  key: string,
  maxLength: number,
): string | null {
  const value = record[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function requiredContentString(
  record: UnknownRecord,
  key: string,
  maxLength: number,
): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 && value.length <= maxLength
    ? value
    : null;
}

function hasOnlyKeys(record: UnknownRecord, allowed: ReadonlySet<string>) {
  return Object.keys(record).every((key) => allowed.has(key));
}

function isCanonicalBase64(value: string, maxLength: number) {
  return (
    value.length > 0 &&
    value.length <= maxLength &&
    value.length % 4 === 0 &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  );
}

function isVoiceResponseStatus(value: unknown): value is VoiceResponseStatus {
  return typeof value === "string" && RESPONSE_STATUSES.has(value as VoiceResponseStatus);
}

export function parseVoiceSourceSnapshot(
  value: unknown,
): VoiceSourceSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.pdfPages)) return null;

  const sourceId = requiredTrimmedString(value, "sourceId", 200);
  const editionId = requiredTrimmedString(value, "editionId", 200);
  const title = requiredTrimmedString(value, "title", 500);
  const quote = requiredTrimmedString(value, "quote", 20_000);
  const contentHash = requiredTrimmedString(value, "contentHash", 200);
  const pdfPages = value.pdfPages.filter(
    (page): page is number => Number.isInteger(page) && page > 0,
  );

  if (
    !sourceId ||
    !editionId ||
    !title ||
    !quote ||
    !contentHash ||
    pdfPages.length !== value.pdfPages.length
  ) {
    return null;
  }

  return Object.freeze({
    sourceId,
    editionId,
    title,
    quote,
    contentHash,
    pdfPages: Object.freeze([...pdfPages]),
  });
}

export function buildStepFunSessionUpdate(
  snapshot: VoiceSourceSnapshot,
  voice = "linjiajiejie",
) {
  const sourceContext = [
    "你只负责实时语音采集期间的非语义反馈，不担任原文陪读或世界行动判断。",
    "等待时最多用极短确认，例如“嗯”或“我在听”。",
    "不得回答读者问题、解释原文、给出建议、保存 Idea、判断意图、执行或承诺任何世界变化，也不得说已经完成。",
    "每条 reader final transcript 都由统一 AgentTurn 处理；你不得与它竞争权威结果。",
    "本次通话开始时已固定以下原文快照；本次通话中不要切换到其他段落。",
    `source_id: ${snapshot.sourceId}`,
    `edition_id: ${snapshot.editionId}`,
    `content_hash: ${snapshot.contentHash}`,
    `title: ${snapshot.title}`,
    `quote:\n${snapshot.quote}`,
  ].join("\n");

  return {
    event_id: crypto.randomUUID(),
    type: "session.update" as const,
    session: {
      modalities: ["text", "audio"],
      instructions: sourceContext,
      voice,
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      turn_detection: {
        type: "server_vad",
        prefix_padding_ms: 500,
        silence_duration_ms: 500,
      },
    },
  };
}

/** Strictly validates the two provider events that can make a session ready. */
export function parseStepFunSessionLifecycleEvent(
  value: unknown,
): StepFunSessionLifecycleEvent | null {
  if (!isRecord(value)) return null;
  if (value.type !== "session.created" && value.type !== "session.updated") {
    return null;
  }
  const eventId = optionalBoundedString(value, "event_id", MAX_PROVIDER_ID_LENGTH);
  const session = value.session;
  if (!eventId || !isRecord(session)) return null;
  if (
    !Array.isArray(session.modalities) ||
    session.modalities.length !== 2 ||
    session.modalities[0] !== "text" ||
    session.modalities[1] !== "audio" ||
    session.input_audio_format !== "pcm16" ||
    session.output_audio_format !== "pcm16"
  ) {
    return null;
  }
  if (value.type === "session.updated") {
    const turnDetection = session.turn_detection;
    if (!isRecord(turnDetection) || turnDetection.type !== "server_vad") {
      return null;
    }
  }
  return { type: value.type, eventId };
}

export function parseVoiceClientCommand(value: unknown): VoiceClientCommand | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;

  if (value.type === "input_audio_buffer.append") {
    if (
      typeof value.audio !== "string" ||
      !hasOnlyKeys(value, new Set(["type", "audio"])) ||
      !isCanonicalBase64(value.audio, MAX_AUDIO_CHUNK_LENGTH)
    ) {
      return null;
    }
    return { type: value.type, audio: value.audio };
  }

  if (
    value.type === "input_audio_buffer.clear" ||
    value.type === "input_audio_buffer.commit" ||
    value.type === "response.create" ||
    value.type === "response.cancel"
  ) {
    if (!hasOnlyKeys(value, new Set(["type"]))) return null;
    return { type: value.type };
  }

  return null;
}

export function normalizeStepFunServerEvent(
  value: unknown,
): VoiceBrowserEvent | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  const eventId = optionalBoundedString(value, "event_id", MAX_PROVIDER_ID_LENGTH);
  if (!eventId) return null;
  const itemId = optionalBoundedString(value, "item_id", MAX_PROVIDER_ID_LENGTH);

  switch (value.type) {
    case "input_audio_buffer.speech_started":
      return itemId ? { type: "reader.speech_started", itemId } : null;
    case "input_audio_buffer.speech_stopped":
      return itemId ? { type: "reader.speech_stopped", itemId } : null;
    case "conversation.item.input_audio_transcription.completed": {
      const transcript = requiredTrimmedString(
        value,
        "transcript",
        MAX_TRANSCRIPT_LENGTH,
      );
      return transcript && itemId
        ? { type: "reader.transcript_final", itemId, text: transcript }
        : null;
    }
    case "response.audio_transcript.delta": {
      const delta = requiredContentString(value, "delta", MAX_TRANSCRIPT_LENGTH);
      return delta && itemId
        ? {
            type: "companion.transcript_partial",
            itemId,
            text: delta,
            mode: "audio",
          }
        : null;
    }
    case "response.audio_transcript.done": {
      const transcript = requiredTrimmedString(
        value,
        "transcript",
        MAX_TRANSCRIPT_LENGTH,
      );
      return transcript && itemId
        ? {
            type: "companion.transcript_final",
            itemId,
            text: transcript,
            mode: "audio",
          }
        : null;
    }
    case "response.text.delta": {
      const delta = requiredContentString(value, "delta", MAX_TRANSCRIPT_LENGTH);
      return delta && itemId
        ? {
            type: "companion.transcript_partial",
            itemId,
            text: delta,
            mode: "text",
          }
        : null;
    }
    case "response.text.done": {
      const text = requiredTrimmedString(value, "text", MAX_TRANSCRIPT_LENGTH);
      return text && itemId
        ? {
            type: "companion.transcript_final",
            itemId,
            text,
            mode: "text",
          }
        : null;
    }
    case "response.audio.delta": {
      const audio = requiredContentString(value, "delta", MAX_AUDIO_CHUNK_LENGTH);
      return audio && itemId && isCanonicalBase64(audio, MAX_AUDIO_CHUNK_LENGTH)
        ? { type: "companion.audio_delta", audio }
        : null;
    }
    case "response.done": {
      const response = value.response;
      const status = isRecord(response)
        ? response.status
        : undefined;
      return isVoiceResponseStatus(status)
        ? { type: "companion.response_done", status }
        : null;
    }
    case "error": {
      const error = value.error;
      if (!isRecord(error)) return null;
      const providerMessage = requiredContentString(error, "message", 2_000);
      if (!providerMessage) return null;
      const code = optionalBoundedString(error, "code", 200);
      return {
        type: "voice.error",
        ...(code ? { code } : {}),
        message: "阶跃实时语音暂时不可用，请重试或继续使用文字输入。",
      };
    }
    default:
      return null;
  }
}

/** Runtime validation for the server-owned SSE boundary in the browser. */
export function parseVoiceBrowserEvent(value: unknown): VoiceBrowserEvent | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  const itemId = optionalBoundedString(value, "itemId", MAX_PROVIDER_ID_LENGTH);

  switch (value.type) {
    case "reader.speech_started":
    case "reader.speech_stopped":
      return itemId ? { type: value.type, itemId } : null;
    case "reader.transcript_final": {
      const text = requiredTrimmedString(value, "text", MAX_TRANSCRIPT_LENGTH);
      return itemId && text ? { type: value.type, itemId, text } : null;
    }
    case "companion.transcript_partial":
    case "companion.transcript_final": {
      const text =
        value.type === "companion.transcript_partial"
          ? requiredContentString(value, "text", MAX_TRANSCRIPT_LENGTH)
          : requiredTrimmedString(value, "text", MAX_TRANSCRIPT_LENGTH);
      const mode = value.mode;
      return itemId && text && (mode === "audio" || mode === "text")
        ? { type: value.type, itemId, text, mode }
        : null;
    }
    case "companion.audio_delta": {
      const audio = requiredContentString(value, "audio", MAX_AUDIO_CHUNK_LENGTH);
      return audio && isCanonicalBase64(audio, MAX_AUDIO_CHUNK_LENGTH)
        ? { type: value.type, audio }
        : null;
    }
    case "companion.response_done":
      return isVoiceResponseStatus(value.status)
        ? { type: value.type, status: value.status }
        : null;
    case "voice.error": {
      const message = requiredTrimmedString(value, "message", 2_000);
      if (!message) return null;
      const code = optionalBoundedString(value, "code", 200);
      return { type: value.type, ...(code ? { code } : {}), message };
    }
    case "voice.closed": {
      const reason = requiredTrimmedString(value, "reason", 2_000);
      return reason ? { type: value.type, reason } : null;
    }
    default:
      return null;
  }
}

export function withEventId(command: VoiceClientCommand): StepFunClientEvent {
  return { event_id: crypto.randomUUID(), ...command };
}
