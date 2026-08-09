/**
 * BookThought accept / revise — EventStore-first (T006).
 * ask/reject never touch this module (transient UI only).
 *
 * F38: SourceDiscussionResolverPort is the only source-of-truth for identity.
 * Client-reported candidate/live snapshots are never authoritative.
 * Event payload source_ids/evidence_refs are taken only from canonical.
 */
import type { DomainEventDraft } from "@/modules/reader-world/events/envelope";
import type { EventStore } from "@/modules/reader-world/event-store";
import { foldReadingGraph } from "@/modules/reader-world/projections/reading-graph";
import type { ReadingGraphView } from "@/modules/reader-world/projections/types";
import type {
  BookThoughtCandidate,
  SourceDiscussionSnapshot,
} from "@/modules/agent-os/companion";
import {
  validateBookThoughtRevise,
  validateCompanionCandidate,
} from "@/modules/agent-os/guardian";
import { createDomainEventDraftBrowser } from "./draft";
import {
  isKnownSourceId,
  LIVE_EXPERIENCE_ID,
  LIVE_PRINCIPAL_ID,
  PRODUCER,
} from "./constants";
import { evidenceIdentityKey } from "./source-evidence";
import {
  thinkingErr,
  thinkingOk,
  type ThinkingResult,
} from "./errors";
import type {
  ClockPort,
  IdPort,
  SourceDiscussionResolverPort,
} from "./ports";

function asDomainEventDraft(draft: unknown): DomainEventDraft {
  return draft as DomainEventDraft;
}

export type BookThoughtPorts = {
  store: EventStore;
  ids: IdPort;
  clock: ClockPort;
  /** Sealed T002 discussion map (ReadingShell / loadWealthOfNationsBook). */
  resolver: SourceDiscussionResolverPort;
  experience_id?: string;
  principal_id?: string;
};

const HASH_RE = /^[a-f0-9]{64}$/i;
const FRAGMENT_RE = /^Smith_0206-01_\d+$/;

const SNAPSHOT_KEYS = new Set([
  "source_id",
  "quote",
  "fragment",
  "pdf_page",
  "print_page",
  "edition_id",
  "edition_revision",
  "edition_content_hash",
  "source_content_hash",
  "evidence_refs",
]);

const CANDIDATE_KEYS = new Set([
  "answer_zh",
  "quote_exact",
  "inference_zh",
  "thought_kind",
  "confidence",
  "open_question",
  "source_ids",
  "evidence_refs",
  "candidate_id",
  "source_snapshot",
  "stale",
]);

/** Accept input: only candidate (+ optional thought_id) + idempotency. No live_source authority. */
const ACCEPT_ROOT_KEYS = new Set([
  "candidate",
  "thought_id",
  "idempotency_key",
  "source_id",
]);

const REVISE_ROOT_KEYS = new Set([
  "thought_id",
  "inference_zh",
  "confidence",
  "open_question",
  "thought_kind",
  "idempotency_key",
]);

async function loadGraph(
  store: EventStore,
  experience_id: string,
): Promise<ThinkingResult<{ graph: ReadingGraphView; version: number }>> {
  const loaded = await store.load(experience_id);
  if (!loaded.ok) {
    return thinkingErr("STORE_ERROR", loaded.error.message);
  }
  const version = loaded.value.length
    ? loaded.value[loaded.value.length - 1]!.stream_version
    : 0;
  return thinkingOk({
    graph: foldReadingGraph(experience_id, loaded.value),
    version,
  });
}

function unknownKeys(
  obj: Record<string, unknown>,
  allowed: Set<string>,
): string[] {
  return Object.keys(obj).filter((k) => !allowed.has(k));
}

/**
 * Parse client-reported snapshot shape only (format / allowlist).
 * Not authority — compare against resolver canonical after this.
 */
export function parseSourceDiscussionSnapshot(
  v: unknown,
  label = "snapshot",
): ThinkingResult<SourceDiscussionSnapshot> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      `MALFORMED_PAYLOAD: ${label} 必须是对象`,
    );
  }
  const o = v as Record<string, unknown>;
  const bad = unknownKeys(o, SNAPSHOT_KEYS);
  if (bad.length > 0) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      `MALFORMED_PAYLOAD: ${label} 未知字段: ${bad.join(",")}`,
    );
  }
  if (typeof o.source_id !== "string" || !o.source_id) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      `MALFORMED_PAYLOAD: ${label}.source_id 必须是非空 string`,
    );
  }
  if (!isKnownSourceId(o.source_id)) {
    return thinkingErr(
      "SOURCE_UNAVAILABLE",
      `未知来源（非 T002 sealed）: ${o.source_id}`,
    );
  }
  if (typeof o.quote !== "string") {
    return thinkingErr(
      "GUARDIAN_REJECT",
      `MALFORMED_PAYLOAD: ${label}.quote 必须是 string`,
    );
  }
  if (typeof o.fragment !== "string" || !FRAGMENT_RE.test(o.fragment)) {
    return thinkingErr(
      "SOURCE_EVIDENCE_DRIFT",
      `无效 OLL fragment locator: ${String(o.fragment)}`,
    );
  }
  if (
    typeof o.pdf_page !== "number" ||
    !Number.isFinite(o.pdf_page) ||
    o.pdf_page <= 0
  ) {
    return thinkingErr("SOURCE_EVIDENCE_DRIFT", "无效 pdf_page");
  }
  if (
    typeof o.print_page !== "number" ||
    !Number.isFinite(o.print_page) ||
    o.print_page <= 0
  ) {
    return thinkingErr("SOURCE_EVIDENCE_DRIFT", "无效 print_page");
  }
  if (typeof o.edition_id !== "string" || !o.edition_id.trim()) {
    return thinkingErr("SOURCE_EVIDENCE_DRIFT", "缺少 edition_id");
  }
  if (typeof o.edition_revision !== "string" || !o.edition_revision.trim()) {
    return thinkingErr("SOURCE_EVIDENCE_DRIFT", "缺少 edition_revision");
  }
  if (
    typeof o.edition_content_hash !== "string" ||
    !HASH_RE.test(o.edition_content_hash)
  ) {
    return thinkingErr(
      "SOURCE_EVIDENCE_DRIFT",
      "edition_content_hash 必须是 64hex",
    );
  }
  if (
    typeof o.source_content_hash !== "string" ||
    !HASH_RE.test(o.source_content_hash)
  ) {
    return thinkingErr(
      "SOURCE_EVIDENCE_DRIFT",
      "source_content_hash 必须是 64hex",
    );
  }
  if (
    !Array.isArray(o.evidence_refs) ||
    !o.evidence_refs.every((x) => typeof x === "string")
  ) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      `MALFORMED_PAYLOAD: ${label}.evidence_refs 必须是 string[]`,
    );
  }
  return thinkingOk(o as unknown as SourceDiscussionSnapshot);
}

export function isSourceDiscussionSnapshot(
  v: unknown,
): v is SourceDiscussionSnapshot {
  return parseSourceDiscussionSnapshot(v).ok;
}

/**
 * Unified source snapshot identity (F38):
 * source_id, fragment, pdf/print page, edition id/revision/hash,
 * source hash, evidence_refs.
 */
export function snapshotsMatch(
  a: SourceDiscussionSnapshot,
  b: SourceDiscussionSnapshot,
): boolean {
  return (
    a.source_id === b.source_id &&
    a.fragment === b.fragment &&
    a.pdf_page === b.pdf_page &&
    a.print_page === b.print_page &&
    a.edition_id === b.edition_id &&
    a.edition_revision === b.edition_revision &&
    a.edition_content_hash === b.edition_content_hash &&
    a.source_content_hash === b.source_content_hash &&
    evidenceIdentityKey(a.source_id, a.evidence_refs) ===
      evidenceIdentityKey(b.source_id, b.evidence_refs)
  );
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function parseAcceptCandidate(
  raw: unknown,
): ThinkingResult<BookThoughtCandidate> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      "MALFORMED_PAYLOAD: candidate 必须是对象",
    );
  }
  const o = raw as Record<string, unknown>;
  const bad = unknownKeys(o, CANDIDATE_KEYS);
  if (bad.length > 0) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      `MALFORMED_PAYLOAD: candidate 未知字段: ${bad.join(",")}`,
    );
  }
  if (typeof o.stale !== "boolean") {
    return thinkingErr(
      "GUARDIAN_REJECT",
      "MALFORMED_PAYLOAD: stale 必须是 boolean",
    );
  }
  if (typeof o.candidate_id !== "string" || !o.candidate_id) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      "MALFORMED_PAYLOAD: candidate_id 必须是非空 string",
    );
  }
  const snap = parseSourceDiscussionSnapshot(
    o.source_snapshot,
    "source_snapshot",
  );
  if (!snap.ok) return snap;

  if (typeof o.answer_zh !== "string") {
    return thinkingErr(
      "GUARDIAN_REJECT",
      "MALFORMED_PAYLOAD: answer_zh 必须是 string",
    );
  }
  if (typeof o.quote_exact !== "string") {
    return thinkingErr(
      "GUARDIAN_REJECT",
      "MALFORMED_PAYLOAD: quote_exact 必须是 string",
    );
  }
  if (typeof o.inference_zh !== "string") {
    return thinkingErr(
      "GUARDIAN_REJECT",
      "MALFORMED_PAYLOAD: inference_zh 必须是 string",
    );
  }
  if (typeof o.thought_kind !== "string") {
    return thinkingErr(
      "GUARDIAN_REJECT",
      "MALFORMED_PAYLOAD: thought_kind 必须是 string",
    );
  }
  if (typeof o.confidence !== "number" || Number.isNaN(o.confidence)) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      "MALFORMED_PAYLOAD: confidence 必须是 number",
    );
  }
  if (
    o.open_question !== null &&
    o.open_question !== undefined &&
    typeof o.open_question !== "string"
  ) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      "MALFORMED_PAYLOAD: open_question 必须是 string 或 null",
    );
  }
  if (!isStringArray(o.source_ids) || o.source_ids.length === 0) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      "MALFORMED_PAYLOAD: source_ids 必须是非空 string[]",
    );
  }
  if (o.source_ids.length !== 1 || o.source_ids[0] !== snap.value.source_id) {
    return thinkingErr(
      "SOURCE_EVIDENCE_CONFLICT",
      "source_ids 必须精确等于 [active source_id]",
    );
  }
  if (!isKnownSourceId(o.source_ids[0]!)) {
    return thinkingErr("SOURCE_UNAVAILABLE", `未知来源: ${o.source_ids[0]}`);
  }
  if (!isStringArray(o.evidence_refs)) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      "MALFORMED_PAYLOAD: evidence_refs 必须是 string[]",
    );
  }
  return thinkingOk({
    answer_zh: o.answer_zh,
    quote_exact: o.quote_exact,
    inference_zh: o.inference_zh,
    thought_kind: o.thought_kind as BookThoughtCandidate["thought_kind"],
    confidence: o.confidence,
    open_question:
      typeof o.open_question === "string" ? o.open_question : null,
    source_ids: [...o.source_ids],
    evidence_refs: [...o.evidence_refs],
    candidate_id: o.candidate_id,
    source_snapshot: snap.value,
    stale: o.stale,
  });
}

function sourceEvidenceKey(
  source_ids: string[],
  evidence_refs: string[],
): string {
  return evidenceIdentityKey(source_ids[0] ?? "", evidence_refs);
}

/** Resolve canonical sealed snapshot; never trust client fields as truth. */
function resolveCanonical(
  ports: BookThoughtPorts,
  source_id: string,
): ThinkingResult<SourceDiscussionSnapshot> {
  if (!ports.resolver || typeof ports.resolver.get !== "function") {
    return thinkingErr(
      "SOURCE_UNAVAILABLE",
      "SourceDiscussionResolverPort 未注入",
    );
  }
  if (!isKnownSourceId(source_id)) {
    return thinkingErr("SOURCE_UNAVAILABLE", `未知来源: ${source_id}`);
  }
  let canonical: SourceDiscussionSnapshot | null;
  try {
    canonical = ports.resolver.get(source_id);
  } catch {
    return thinkingErr(
      "SOURCE_UNAVAILABLE",
      `resolver 失败: ${source_id}`,
    );
  }
  if (!canonical) {
    return thinkingErr(
      "SOURCE_UNAVAILABLE",
      `resolver 无 canonical: ${source_id}`,
    );
  }
  // Re-validate resolver output is well-formed (defense in depth).
  const parsed = parseSourceDiscussionSnapshot(canonical, "canonical");
  if (!parsed.ok) {
    return thinkingErr(
      "SOURCE_UNAVAILABLE",
      `canonical 不可用: ${parsed.error.message}`,
    );
  }
  if (parsed.value.source_id !== source_id) {
    return thinkingErr(
      "SOURCE_EVIDENCE_CONFLICT",
      "resolver 返回的 source_id 与请求不一致",
    );
  }
  return thinkingOk(parsed.value);
}

export type AcceptBookThoughtInput = {
  candidate: BookThoughtCandidate;
  /** Optional override; default = candidate.source_ids[0]. */
  source_id?: string;
  thought_id?: string;
  idempotency_key: string;
};

export type AcceptBookThoughtOutput = {
  thought_id: string;
  revision: number;
  graph: ReadingGraphView;
  committed_version: number;
  duplicate: boolean;
};

export async function acceptBookThought(
  ports: BookThoughtPorts,
  input: unknown,
): Promise<ThinkingResult<AcceptBookThoughtOutput>> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      "MALFORMED_PAYLOAD: accept input 必须是对象",
    );
  }
  const rawIn = input as Record<string, unknown>;
  const badRoot = unknownKeys(rawIn, ACCEPT_ROOT_KEYS);
  if (badRoot.length > 0) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      `MALFORMED_PAYLOAD: accept 未知字段: ${badRoot.join(",")}`,
    );
  }
  if (typeof rawIn.idempotency_key !== "string" || !rawIn.idempotency_key) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      "MALFORMED_PAYLOAD: idempotency_key 必须是非空 string",
    );
  }
  if (
    rawIn.thought_id !== undefined &&
    (typeof rawIn.thought_id !== "string" || !rawIn.thought_id)
  ) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      "MALFORMED_PAYLOAD: thought_id 若提供必须是非空 string",
    );
  }
  if (
    rawIn.source_id !== undefined &&
    (typeof rawIn.source_id !== "string" || !rawIn.source_id)
  ) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      "MALFORMED_PAYLOAD: source_id 若提供必须是非空 string",
    );
  }

  const parsed = parseAcceptCandidate(rawIn.candidate);
  if (!parsed.ok) return parsed;
  const cand = parsed.value;

  if (cand.stale) {
    return thinkingErr("STALE_CANDIDATE", "候选已过期（来源已切换），不能保存");
  }

  const source_id =
    typeof rawIn.source_id === "string"
      ? rawIn.source_id
      : cand.source_ids[0]!;

  if (source_id !== cand.source_ids[0] || source_id !== cand.source_snapshot.source_id) {
    return thinkingErr(
      "SOURCE_EVIDENCE_CONFLICT",
      "source_id 与 candidate 绑定不一致",
    );
  }

  // Authority: sealed T002 map only.
  const canon = resolveCanonical(ports, source_id);
  if (!canon.ok) return canon;
  const canonical = canon.value;

  // Client snapshot must equal canonical field-by-field (blocks division+market spoof).
  if (!snapshotsMatch(cand.source_snapshot, canonical)) {
    return thinkingErr(
      "SOURCE_EVIDENCE_DRIFT",
      "candidate snapshot 与 T002 canonical 不一致",
    );
  }
  // Candidate-reported evidence_refs must also match canonical (no freehand refs).
  if (
    evidenceIdentityKey(cand.source_ids[0] ?? "", cand.evidence_refs) !==
    evidenceIdentityKey(canonical.source_id, canonical.evidence_refs)
  ) {
    return thinkingErr(
      "SOURCE_EVIDENCE_DRIFT",
      "candidate evidence_refs 与 canonical 不一致",
    );
  }

  // Guardian against canonical quote/evidence (not client-forged snapshot).
  const guarded = validateCompanionCandidate(canonical, {
    answer_zh: cand.answer_zh,
    quote_exact: cand.quote_exact,
    inference_zh: cand.inference_zh,
    thought_kind: cand.thought_kind,
    confidence: cand.confidence,
    open_question: cand.open_question,
    source_ids: [canonical.source_id],
    evidence_refs: [...canonical.evidence_refs],
  } as unknown);
  if (!guarded.ok) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      `${guarded.code}: ${guarded.message}`,
    );
  }

  const experience_id = ports.experience_id ?? LIVE_EXPERIENCE_ID;
  const principal_id = ports.principal_id ?? LIVE_PRINCIPAL_ID;
  const state = await loadGraph(ports.store, experience_id);
  if (!state.ok) return state;

  const thought_id =
    typeof rawIn.thought_id === "string"
      ? rawIn.thought_id
      : ports.ids.nextId("thought");
  const text = guarded.candidate.inference_zh;
  // Payload identity only from canonical.
  const persistSourceIds = [canonical.source_id];
  const persistEvidence = [...canonical.evidence_refs];
  const candKey = sourceEvidenceKey(persistSourceIds, persistEvidence);

  const existingActive = state.value.graph.thoughts
    .filter((t) => t.thought_id === thought_id && t.status === "active")
    .sort((a, b) => b.revision - a.revision)[0];

  if (existingActive) {
    const existingKey = sourceEvidenceKey(
      existingActive.source_ids,
      existingActive.evidence_refs,
    );
    if (existingKey !== candKey) {
      return thinkingErr(
        "SOURCE_EVIDENCE_CONFLICT",
        "相同 thought_id 但 source/evidence 身份不同，禁止跨来源错绑",
      );
    }
    if (existingActive.text === text) {
      return thinkingOk({
        thought_id,
        revision: existingActive.revision,
        graph: state.value.graph,
        committed_version: state.value.version,
        duplicate: true,
      });
    }
    return reviseBookThought(ports, {
      thought_id,
      inference_zh: text,
      confidence: guarded.candidate.confidence,
      open_question: guarded.candidate.open_question,
      thought_kind: guarded.candidate.thought_kind,
      idempotency_key: rawIn.idempotency_key,
    });
  }

  const draft = await createDomainEventDraftBrowser({
    message_name: "agent_os.book_thought.proposed.v1",
    experience_id,
    correlation_id: ports.ids.nextId("corr"),
    producer: PRODUCER,
    security: {
      principal_id,
      authority: "system",
      integrity: "local",
    },
    recorded_at: ports.clock.nowRfc3339(),
    message_id: ports.ids.nextId("msg"),
    payload: {
      thought_id,
      thought_kind: guarded.candidate.thought_kind,
      text,
      source_ids: persistSourceIds,
      evidence_refs: persistEvidence,
      confidence: guarded.candidate.confidence,
      open_question: guarded.candidate.open_question,
      revision: 1,
      supersedes: null,
    },
  });

  const expected_version = state.value.version === 0 ? -1 : state.value.version;
  const append = await ports.store.append({
    experience_id,
    principal_id,
    idempotency_key: rawIn.idempotency_key,
    expected_version,
    events: [asDomainEventDraft(draft)],
  });

  if (!append.ok) {
    if (append.error.code === "EXPECTED_VERSION_MISMATCH") {
      return thinkingErr("VERSION_MISMATCH", append.error.message, {
        current_version: append.error.current_version,
      });
    }
    if (append.error.code === "IDEMPOTENCY_KEY_REUSED") {
      return thinkingErr("IDEMPOTENCY_KEY_REUSED", append.error.message);
    }
    return thinkingErr("STORE_ERROR", append.error.message);
  }

  const after = await loadGraph(ports.store, experience_id);
  if (!after.ok) return after;

  return thinkingOk({
    thought_id,
    revision: 1,
    graph: after.value.graph,
    committed_version: append.value.committed_version,
    duplicate: append.value.duplicate,
  });
}

export type ReviseBookThoughtInput = {
  thought_id: string;
  inference_zh: string;
  confidence: number;
  open_question: string | null;
  thought_kind?: string;
  idempotency_key: string;
};

export async function reviseBookThought(
  ports: BookThoughtPorts,
  input: unknown,
): Promise<ThinkingResult<AcceptBookThoughtOutput>> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      "MALFORMED_PAYLOAD: revise input 必须是对象",
    );
  }
  const raw = input as Record<string, unknown>;
  const badRoot = unknownKeys(raw, REVISE_ROOT_KEYS);
  if (badRoot.length > 0) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      `MALFORMED_PAYLOAD: revise 未知字段: ${badRoot.join(",")}`,
    );
  }
  if (typeof raw.thought_id !== "string" || !raw.thought_id) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      "MALFORMED_PAYLOAD: thought_id 必须是非空 string",
    );
  }
  if (typeof raw.idempotency_key !== "string" || !raw.idempotency_key) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      "MALFORMED_PAYLOAD: idempotency_key 必须是非空 string",
    );
  }
  const thought_id = raw.thought_id;
  const idempotency_key = raw.idempotency_key;

  const experience_id = ports.experience_id ?? LIVE_EXPERIENCE_ID;
  const principal_id = ports.principal_id ?? LIVE_PRINCIPAL_ID;
  const state = await loadGraph(ports.store, experience_id);
  if (!state.ok) return state;

  const latest = state.value.graph.thoughts
    .filter((t) => t.thought_id === thought_id && t.status === "active")
    .sort((a, b) => b.revision - a.revision)[0];
  if (!latest) {
    return thinkingErr("THOUGHT_NOT_FOUND", `找不到 BookThought: ${thought_id}`);
  }

  if (
    latest.source_ids.length !== 1 ||
    !isKnownSourceId(latest.source_ids[0]!)
  ) {
    return thinkingErr(
      "SOURCE_EVIDENCE_CONFLICT",
      "已存 BookThought 的 source_ids 非单一已知来源，拒绝修订",
    );
  }

  // Re-resolve canonical for latest thought; drift → fail closed.
  const canon = resolveCanonical(ports, latest.source_ids[0]!);
  if (!canon.ok) return canon;
  const canonical = canon.value;
  if (
    sourceEvidenceKey(latest.source_ids, latest.evidence_refs) !==
    sourceEvidenceKey([canonical.source_id], canonical.evidence_refs)
  ) {
    return thinkingErr(
      "SOURCE_EVIDENCE_DRIFT",
      "已存 BookThought evidence 与当前 T002 canonical 漂移",
    );
  }

  const guarded = validateBookThoughtRevise({
    inference_zh: raw.inference_zh,
    confidence: raw.confidence,
    open_question: raw.open_question,
    thought_kind: raw.thought_kind ?? latest.thought_kind,
  });
  if (!guarded.ok) {
    return thinkingErr(
      "GUARDIAN_REJECT",
      `${guarded.code}: ${guarded.message}`,
    );
  }

  const revision = latest.revision + 1;
  const draft = await createDomainEventDraftBrowser({
    message_name: "agent_os.book_thought.proposed.v1",
    experience_id,
    correlation_id: ports.ids.nextId("corr"),
    producer: PRODUCER,
    security: {
      principal_id,
      authority: "system",
      integrity: "local",
    },
    recorded_at: ports.clock.nowRfc3339(),
    message_id: ports.ids.nextId("msg"),
    payload: {
      thought_id,
      thought_kind: guarded.thought_kind,
      text: guarded.inference_zh,
      // Only canonical identity.
      source_ids: [canonical.source_id],
      evidence_refs: [...canonical.evidence_refs],
      confidence: guarded.confidence,
      open_question: guarded.open_question,
      revision,
      supersedes: thought_id,
    },
  });

  const append = await ports.store.append({
    experience_id,
    principal_id,
    idempotency_key,
    expected_version: state.value.version,
    events: [asDomainEventDraft(draft)],
  });

  if (!append.ok) {
    if (append.error.code === "EXPECTED_VERSION_MISMATCH") {
      return thinkingErr("VERSION_MISMATCH", append.error.message, {
        current_version: append.error.current_version,
      });
    }
    if (append.error.code === "IDEMPOTENCY_KEY_REUSED") {
      return thinkingErr("IDEMPOTENCY_KEY_REUSED", append.error.message);
    }
    return thinkingErr("STORE_ERROR", append.error.message);
  }

  const after = await loadGraph(ports.store, experience_id);
  if (!after.ok) return after;

  return thinkingOk({
    thought_id,
    revision,
    graph: after.value.graph,
    committed_version: append.value.committed_version,
    duplicate: append.value.duplicate,
  });
}
