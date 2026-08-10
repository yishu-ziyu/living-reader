import { describe, expect, it } from "vitest";
import {
  acceptReaderTranscriptItem,
  buildStepFunSessionUpdate,
  normalizeStepFunServerEvent,
  parseStepFunSessionLifecycleEvent,
  parseVoiceBrowserEvent,
  parseVoiceClientCommand,
  parseVoiceSourceSnapshot,
  voiceSourceSnapshotsEqual,
  type VoiceSourceSnapshot,
} from "@/modules/voice";

const sourceSnapshot: VoiceSourceSnapshot = {
  sourceId: "smith.b1.c1.division",
  editionId: "cannan-oll-v1",
  title: "Of the Division of Labour",
  quote: "The greatest improvement in the productive powers of labour...",
  contentHash: "sha256-source",
  pdfPages: [36],
};

describe("StepFun realtime protocol", () => {
  it("builds the exact Step Plan PCM16 + server_vad session contract", () => {
    const event = buildStepFunSessionUpdate(sourceSnapshot);

    expect(event.type).toBe("session.update");
    expect(event.session).toMatchObject({
      modalities: ["text", "audio"],
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      turn_detection: {
        type: "server_vad",
        prefix_padding_ms: 500,
        silence_duration_ms: 500,
      },
    });
    expect(event.session.instructions).toContain(sourceSnapshot.sourceId);
    expect(event.session.instructions).toContain(sourceSnapshot.contentHash);
    expect(event.session.instructions).toContain(sourceSnapshot.quote);
    expect(event.session.instructions).toContain("不得回答读者问题");
    expect(event.session.instructions).toContain("AgentTurn");
  });

  it("defaults to the companion voice and accepts a reader-chosen voice", () => {
    expect(buildStepFunSessionUpdate(sourceSnapshot).session.voice).toBe(
      "linjiajiejie",
    );
    expect(
      buildStepFunSessionUpdate(sourceSnapshot, "ruyananshi").session.voice,
    ).toBe("ruyananshi");
  });

  it("normalizes official reader final, companion partial/final and audio events", () => {
    expect(
      normalizeStepFunServerEvent({
        event_id: "event-reader-final",
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "reader-1",
        transcript: "分工为什么提高效率？",
      }),
    ).toEqual({
      type: "reader.transcript_final",
      itemId: "reader-1",
      text: "分工为什么提高效率？",
    });
    expect(
      normalizeStepFunServerEvent({
        event_id: "event-audio-transcript-delta",
        type: "response.audio_transcript.delta",
        item_id: "assistant-1",
        delta: "因为",
      }),
    ).toEqual({
      type: "companion.transcript_partial",
      itemId: "assistant-1",
      text: "因为",
      mode: "audio",
    });
    expect(
      normalizeStepFunServerEvent({
        event_id: "event-audio-transcript-done",
        type: "response.audio_transcript.done",
        item_id: "assistant-1",
        transcript: "因为熟练度提高。",
      }),
    ).toEqual({
      type: "companion.transcript_final",
      itemId: "assistant-1",
      text: "因为熟练度提高。",
      mode: "audio",
    });
    expect(
      normalizeStepFunServerEvent({
        event_id: "event-audio-delta",
        type: "response.audio.delta",
        item_id: "assistant-1",
        delta: "AAECAw==",
      }),
    ).toEqual({ type: "companion.audio_delta", audio: "AAECAw==" });
    expect(
      normalizeStepFunServerEvent({
        event_id: "event-error",
        type: "error",
        error: {
          code: "provider_internal",
          message: "internal upstream detail must not reach the browser",
        },
      }),
    ).toEqual({
      type: "voice.error",
      code: "provider_internal",
      message: "阶跃实时语音暂时不可用，请重试或继续使用文字输入。",
    });
  });

  it("accepts only a complete StepFun session lifecycle envelope", () => {
    expect(
      parseStepFunSessionLifecycleEvent({
        event_id: "event-session-created",
        type: "session.created",
        session: {
          modalities: ["text", "audio"],
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
        },
      }),
    ).toEqual({
      type: "session.created",
      eventId: "event-session-created",
    });
    expect(
      parseStepFunSessionLifecycleEvent({
        event_id: "event-session-updated",
        type: "session.updated",
        session: {
          modalities: ["text", "audio"],
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          turn_detection: { type: "server_vad" },
        },
      }),
    ).toEqual({
      type: "session.updated",
      eventId: "event-session-updated",
    });
    expect(
      parseStepFunSessionLifecycleEvent({
        type: "session.updated",
        session: {
          modalities: ["text", "audio"],
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          turn_detection: { type: "server_vad" },
        },
      }),
    ).toBeNull();
    expect(
      parseStepFunSessionLifecycleEvent({
        event_id: "event-session-updated",
        type: "session.updated",
        session: {
          modalities: ["text", "audio"],
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          turn_detection: { type: "client_vad" },
        },
      }),
    ).toBeNull();
  });

  it("accepts a source snapshot without an unverified PDF mapping", () => {
    expect(
      parseVoiceSourceSnapshot({ ...sourceSnapshot, pdfPages: [] }),
    ).toMatchObject({
      sourceId: sourceSnapshot.sourceId,
      pdfPages: [],
    });
  });

  it("fails closed for arbitrary commands and oversized or malformed snapshots", () => {
    expect(parseVoiceClientCommand({ type: "session.update" })).toBeNull();
    expect(
      parseVoiceClientCommand({
        type: "response.cancel",
        untrusted: true,
      }),
    ).toBeNull();
    expect(
      parseVoiceClientCommand({
        type: "input_audio_buffer.append",
        audio: "not base64!",
      }),
    ).toBeNull();
    expect(parseVoiceSourceSnapshot({ ...sourceSnapshot, quote: "" })).toBeNull();
    expect(
      parseVoiceSourceSnapshot({ ...sourceSnapshot, pdfPages: [36, "37"] }),
    ).toBeNull();
    expect(normalizeStepFunServerEvent({ type: "session.updated" })).toBeNull();
    expect(
      normalizeStepFunServerEvent({
        event_id: "event-reader-final",
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "missing item id",
      }),
    ).toBeNull();
    expect(
      normalizeStepFunServerEvent({
        event_id: "event-response-done",
        type: "response.done",
        response: { status: "in_progress" },
      }),
    ).toBeNull();
    expect(
      parseVoiceBrowserEvent({
        type: "reader.transcript_final",
        text: "missing item id",
      }),
    ).toBeNull();
    expect(
      parseVoiceBrowserEvent({
        type: "companion.audio_delta",
        audio: "not base64!",
      }),
    ).toBeNull();
  });

  it("revalidates the server-owned browser event boundary", () => {
    expect(
      parseVoiceBrowserEvent({
        type: "reader.transcript_final",
        itemId: "reader-1",
        text: " 分工会让人更熟练吗？ ",
      }),
    ).toEqual({
      type: "reader.transcript_final",
      itemId: "reader-1",
      text: "分工会让人更熟练吗？",
    });
    expect(
      parseVoiceBrowserEvent({
        type: "companion.response_done",
        status: "cancelled",
      }),
    ).toEqual({
      type: "companion.response_done",
      status: "cancelled",
    });
  });

  it("accepts the same reader item exactly once across SSE replay", () => {
    const processed = new Set<string>();

    expect(acceptReaderTranscriptItem(processed, "reader-item-1")).toBe(true);
    expect(acceptReaderTranscriptItem(processed, "reader-item-1")).toBe(false);
    expect(acceptReaderTranscriptItem(processed, "reader-item-2")).toBe(true);
    expect(processed).toEqual(new Set(["reader-item-1", "reader-item-2"]));
  });

  it("compares every sealed source field", () => {
    expect(voiceSourceSnapshotsEqual(sourceSnapshot, { ...sourceSnapshot })).toBe(
      true,
    );
    expect(
      voiceSourceSnapshotsEqual(sourceSnapshot, {
        ...sourceSnapshot,
        contentHash: "changed",
      }),
    ).toBe(false);
  });
});
