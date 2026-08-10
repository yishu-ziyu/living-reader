import { describe, expect, it } from "vitest";
import {
  DEFAULT_VOICE_PREFERENCES,
  parseVoiceId,
  parseVoicePreferences,
} from "@/modules/voice";

describe("voice preferences", () => {
  it("accepts a complete valid preference set", () => {
    expect(
      parseVoicePreferences({ voice: "ruyananshi", rate: 1.25, volume: 0.8 }),
    ).toEqual({ voice: "ruyananshi", rate: 1.25, volume: 0.8 });
  });

  it("rejects unknown voices, out-of-range values and malformed input", () => {
    expect(parseVoiceId("not-a-voice")).toBeNull();
    expect(
      parseVoicePreferences({ voice: "not-a-voice", rate: 1, volume: 1 }),
    ).toBeNull();
    expect(
      parseVoicePreferences({ voice: "linjiajiejie", rate: 4, volume: 1 }),
    ).toBeNull();
    expect(
      parseVoicePreferences({ voice: "linjiajiejie", rate: 1, volume: -0.5 }),
    ).toBeNull();
    expect(parseVoicePreferences(null)).toBeNull();
    expect(parseVoicePreferences("linjiajiejie")).toBeNull();
  });

  it("ships the accepted companion defaults", () => {
    expect(DEFAULT_VOICE_PREFERENCES).toEqual({
      voice: "linjiajiejie",
      rate: 1,
      volume: 1,
    });
  });
});
