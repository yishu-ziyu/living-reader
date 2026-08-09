import type { VoiceSourceSnapshot } from "./contracts";

export const STEPFUN_REALTIME_URL =
  "wss://api.stepfun.com/step_plan/v1/realtime?model=stepaudio-2.5-realtime";

export type VoiceClientCommand =
  | { type: "input_audio_buffer.append"; audio: string }
  | { type: "input_audio_buffer.clear" }
  | { type: "input_audio_buffer.commit" }
  | { type: "response.create" }
  | { type: "response.cancel" };

export type VoiceBrowserEvent =
  | { type: "reader.speech_started"; itemId?: string }
  | { type: "reader.speech_stopped"; itemId?: string }
  | { type: "reader.transcript_final"; itemId?: string; text: string }
  | {
      type: "companion.transcript_partial";
      itemId?: string;
      text: string;
      mode: "audio" | "text";
    }
  | {
      type: "companion.transcript_final";
      itemId?: string;
      text: string;
      mode: "audio" | "text";
    }
  | { type: "companion.audio_delta"; audio: string }
  | { type: "companion.response_done"; status: string }
  | { type: "voice.error"; code?: string; message: string }
  | { type: "voice.closed"; reason: string };

export type StepFunClientEvent = VoiceClientCommand & { event_id: string };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(record: UnknownRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
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
    pdfPages.length !== value.pdfPages.length ||
    pdfPages.length === 0
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

export function buildStepFunSessionUpdate(snapshot: VoiceSourceSnapshot) {
  const sourceContext = [
    "你是《国富论》的中文陪读。回答应简洁、自然，并明确区分原文与解释。",
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
      voice: "linjiajiejie",
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

export function parseVoiceClientCommand(value: unknown): VoiceClientCommand | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;

  if (value.type === "input_audio_buffer.append") {
    if (
      typeof value.audio !== "string" ||
      !value.audio ||
      value.audio.length > 350_000 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(value.audio)
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
    return { type: value.type };
  }

  return null;
}

export function normalizeStepFunServerEvent(
  value: unknown,
): VoiceBrowserEvent | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  const itemId = optionalString(value, "item_id");

  switch (value.type) {
    case "input_audio_buffer.speech_started":
      return { type: "reader.speech_started", itemId };
    case "input_audio_buffer.speech_stopped":
      return { type: "reader.speech_stopped", itemId };
    case "conversation.item.input_audio_transcription.completed": {
      const transcript = optionalString(value, "transcript");
      return transcript && itemId
        ? { type: "reader.transcript_final", itemId, text: transcript }
        : null;
    }
    case "response.audio_transcript.delta": {
      const delta = optionalString(value, "delta");
      return delta
        ? {
            type: "companion.transcript_partial",
            itemId,
            text: delta,
            mode: "audio",
          }
        : null;
    }
    case "response.audio_transcript.done": {
      const transcript = optionalString(value, "transcript");
      return transcript
        ? {
            type: "companion.transcript_final",
            itemId,
            text: transcript,
            mode: "audio",
          }
        : null;
    }
    case "response.text.delta": {
      const delta = optionalString(value, "delta");
      return delta
        ? {
            type: "companion.transcript_partial",
            itemId,
            text: delta,
            mode: "text",
          }
        : null;
    }
    case "response.text.done": {
      const text = optionalString(value, "text");
      return text
        ? {
            type: "companion.transcript_final",
            itemId,
            text,
            mode: "text",
          }
        : null;
    }
    case "response.audio.delta": {
      const audio = optionalString(value, "delta");
      return audio ? { type: "companion.audio_delta", audio } : null;
    }
    case "response.done": {
      const response = value.response;
      const status = isRecord(response)
        ? optionalString(response, "status")
        : undefined;
      return { type: "companion.response_done", status: status ?? "unknown" };
    }
    case "error": {
      const error = value.error;
      const errorRecord = isRecord(error) ? error : {};
      return {
        type: "voice.error",
        code: optionalString(errorRecord, "code"),
        message:
          optionalString(errorRecord, "message") ?? "阶跃实时语音返回错误。",
      };
    }
    default:
      return null;
  }
}

export function withEventId(command: VoiceClientCommand): StepFunClientEvent {
  return { event_id: crypto.randomUUID(), ...command };
}
