import { describe, expect, it } from "vitest";
import {
  acceptReaderTranscriptItem,
  buildStepFunSessionUpdate,
  normalizeStepFunServerEvent,
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
  });

  it("normalizes official reader final, companion partial/final and audio events", () => {
    expect(
      normalizeStepFunServerEvent({
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
        type: "response.audio.delta",
        delta: "AAECAw==",
      }),
    ).toEqual({ type: "companion.audio_delta", audio: "AAECAw==" });
  });

  it("fails closed for arbitrary commands and oversized or malformed snapshots", () => {
    expect(parseVoiceClientCommand({ type: "session.update" })).toBeNull();
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
