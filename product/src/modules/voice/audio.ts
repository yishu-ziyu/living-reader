const TARGET_SAMPLE_RATE = 24_000;

export function downsampleToPcm16(
  samples: Float32Array,
  inputSampleRate: number,
  targetSampleRate = TARGET_SAMPLE_RATE,
): Int16Array {
  if (!Number.isFinite(inputSampleRate) || inputSampleRate <= 0) {
    throw new Error("inputSampleRate must be positive");
  }
  if (targetSampleRate <= 0 || targetSampleRate > inputSampleRate) {
    throw new Error("targetSampleRate must be positive and no greater than input");
  }

  const ratio = inputSampleRate / targetSampleRate;
  const output = new Int16Array(Math.floor(samples.length / ratio));

  for (let outputIndex = 0; outputIndex < output.length; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio);
    const end = Math.min(samples.length, Math.floor((outputIndex + 1) * ratio));
    let total = 0;
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) {
      total += samples[inputIndex] ?? 0;
    }
    const averaged = total / Math.max(1, end - start);
    const clamped = Math.max(-1, Math.min(1, averaged));
    output[outputIndex] = Math.round(
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
    );
  }

  return output;
}

export function pcm16ToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(
    samples.buffer,
    samples.byteOffset,
    samples.byteLength,
  );
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export function base64ToPcm16(encoded: string): Int16Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Int16Array(bytes.buffer);
}

export const STEPFUN_PCM_SAMPLE_RATE = TARGET_SAMPLE_RATE;
