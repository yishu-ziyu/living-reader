import {
  parseAgentTurnProviderInput,
  type VerifiedAgentTurnSource,
} from "../src/modules/agent-os/provider";
import type { AgentTurnProviderInput } from "../src/modules/agent-os/turn";

export const READING_AGENT_RUNTIME_PATH = "/v1/agent-turn";
export const READING_AGENT_RUNTIME_HEALTH_PATH = "/health";
export const READING_AGENT_RUNTIME_MAX_REQUEST_BYTES = 64 * 1024;

export type ReadingAgentRuntimeRequest = Readonly<{
  source: VerifiedAgentTurnSource;
  turn: AgentTurnProviderInput;
}>;

type UnknownRecord = Record<string, unknown>;

const REQUEST_KEYS: Record<string, true> = {
  source: true,
  turn: true,
};

const SOURCE_KEYS: Record<string, true> = {
  source_id: true,
  edition_id: true,
  content_hash: true,
  title: true,
  quote: true,
};


function hasOnlyKeys(
  value: UnknownRecord,
  allowed: Readonly<Record<string, true>>,
): boolean {
  return Object.keys(value).every((key) => allowed[key] === true);
}

function requiredString(
  value: UnknownRecord,
  key: string,
  maxLength: number,
): string | null {
  const field = value[key];
  if (typeof field !== "string") return null;
  const trimmed = field.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

function parseVerifiedSource(value: unknown): VerifiedAgentTurnSource | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const sourceValue = value as UnknownRecord;
  if (!hasOnlyKeys(sourceValue, SOURCE_KEYS)) return null;
  const source_id = requiredString(sourceValue, "source_id", 200);
  const edition_id = requiredString(sourceValue, "edition_id", 200);
  const content_hash = requiredString(sourceValue, "content_hash", 200);
  const title = requiredString(sourceValue, "title", 500);
  const quote = requiredString(sourceValue, "quote", 20_000);
  if (!source_id || !edition_id || !content_hash || !title || !quote) return null;
  return Object.freeze({ source_id, edition_id, content_hash, title, quote });
}

export function parseReadingAgentRuntimeRequest(
  value: unknown,
): ReadingAgentRuntimeRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const requestValue = value as UnknownRecord;
  if (!hasOnlyKeys(requestValue, REQUEST_KEYS)) return null;
  const source = parseVerifiedSource(requestValue.source);
  const turn = parseAgentTurnProviderInput(requestValue.turn);
  return source && turn ? Object.freeze({ source, turn }) : null;
}
