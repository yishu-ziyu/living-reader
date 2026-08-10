/**
 * Reader-controlled voice preferences for the realtime companion.
 *
 * `voice` is sent to the provider in session.update, so it applies when a
 * call starts. `rate` and `volume` are applied client-side in the playback
 * chain, so they can change live during a call.
 */
export const VOICE_OPTIONS = [
  { id: "linjiajiejie", label: "邻家姐姐" },
  { id: "zhixingjiejie", label: "知性姐姐" },
  { id: "wenrounvsheng", label: "温柔女声" },
  { id: "ruyananshi", label: "儒雅男士" },
  { id: "wenrougongzi", label: "温柔公子" },
  { id: "boyinnansheng", label: "播音男声" },
] as const;

export type VoiceOptionId = (typeof VOICE_OPTIONS)[number]["id"];

export type VoicePreferences = Readonly<{
  voice: VoiceOptionId;
  /** Playback rate multiplier, 0.5–2. */
  rate: number;
  /** Playback gain multiplier, 0–2. */
  volume: number;
}>;

export const DEFAULT_VOICE_PREFERENCES: VoicePreferences = Object.freeze({
  voice: "linjiajiejie",
  rate: 1,
  volume: 1,
});

export const VOICE_PREFERENCES_STORAGE_KEY = "living-reader.voice-preferences.v1";

const RATE_MIN = 0.5;
const RATE_MAX = 2;
const VOLUME_MIN = 0;
const VOLUME_MAX = 2;

const VOICE_OPTION_IDS: ReadonlySet<string> = new Set(
  VOICE_OPTIONS.map((option) => option.id),
);

export function parseVoiceId(value: unknown): VoiceOptionId | null {
  return typeof value === "string" && VOICE_OPTION_IDS.has(value)
    ? (value as VoiceOptionId)
    : null;
}

function isFiniteNumberInRange(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

export function parseVoicePreferences(value: unknown): VoicePreferences | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const voice = parseVoiceId(record.voice);
  if (!voice) return null;
  if (!isFiniteNumberInRange(record.rate, RATE_MIN, RATE_MAX)) return null;
  if (!isFiniteNumberInRange(record.volume, VOLUME_MIN, VOLUME_MAX)) return null;
  return Object.freeze({
    voice,
    rate: record.rate as number,
    volume: record.volume as number,
  });
}

/** Client-only: reads stored preferences, falling back to defaults. */
export function loadVoicePreferences(): VoicePreferences {
  if (typeof window === "undefined") return DEFAULT_VOICE_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(VOICE_PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_VOICE_PREFERENCES;
    return (
      parseVoicePreferences(JSON.parse(raw)) ?? DEFAULT_VOICE_PREFERENCES
    );
  } catch {
    return DEFAULT_VOICE_PREFERENCES;
  }
}

/** Client-only: best-effort persist; storage failures never block reading. */
export function saveVoicePreferences(preferences: VoicePreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      VOICE_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // Private-mode quota errors must not break the reading session.
  }
}
