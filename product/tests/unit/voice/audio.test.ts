import { describe, expect, it } from "vitest";
import {
  base64ToPcm16,
  downsampleToPcm16,
  pcm16ToBase64,
} from "@/modules/voice";

describe("voice PCM utilities", () => {
  it("downsamples 48 kHz floats to clipped 24 kHz PCM16", () => {
    const pcm = downsampleToPcm16(
      new Float32Array([1, 1, -1, -1, 2, 2, -2, -2]),
      48_000,
    );

    expect([...pcm]).toEqual([32767, -32768, 32767, -32768]);
  });

  it("round-trips PCM16 through base64 without changing bytes", () => {
    const source = new Int16Array([0, 1, -1, 32767, -32768]);

    expect([...base64ToPcm16(pcm16ToBase64(source))]).toEqual([...source]);
  });

  it("rejects impossible sample-rate conversion", () => {
    expect(() => downsampleToPcm16(new Float32Array([0]), 16_000)).toThrow(
      "targetSampleRate",
    );
  });
});
