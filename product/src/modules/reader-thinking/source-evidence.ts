/**
 * F33: ReaderIdea evidence is derived only from a live T002 SourceBlock snapshot.
 * Commands must never invent locator/page/hash from local constants tables.
 */

import type {
  BookManifestV2,
  BookSourceBlock,
  Edition,
  LegacySourceId,
  SourceBlock,
} from "@/modules/book/domain";
import {
  isKnownSourceId,
  type KnownSourceId,
} from "./constants";
import { thinkingErr, type ThinkingResult } from "./errors";

/**
 * Portable evidence identity carried into EventStore payloads.
 * Built at the UI/application boundary from SourceBlock + Edition.
 */
export type SourceEvidenceSnapshot = {
  source_id: KnownSourceId;
  /** OLL paragraph fragment id (locator), e.g. Smith_0206-01_235 */
  fragment: string;
  /** Physical PDF mapping exists only for explicitly verified legacy anchors. */
  pdf_page?: number;
  print_page: number;
  edition_id: string;
  edition_revision: string;
  edition_content_hash: string;
  source_content_hash: string;
  /** Stable evidence_refs written into DomainEvent payloads. */
  evidence_refs: string[];
};

/** Input fields required before refs are generated (may omit evidence_refs/PDF). */
export type SourceEvidenceInput = {
  source_id: string;
  fragment: string;
  pdf_page?: number;
  print_page: number;
  edition_id: string;
  edition_revision: string;
  edition_content_hash: string;
  source_content_hash: string;
};

const HASH_RE = /^[a-f0-9]{64}$/i;
export const OLL_PARAGRAPH_FRAGMENT_RE =
  /^Smith_0206-(?:01|02)_[A-Za-z0-9][A-Za-z0-9_.:-]*$/u;

export function buildEvidenceRefsFromFields(
  s: SourceEvidenceInput,
): string[] {
  const refs = [
    `source:${s.source_id}`,
    `locator:oll:fragment:${s.fragment}`,
  ];
  if (s.pdf_page !== undefined) refs.push(`pdf:${s.pdf_page}`);
  refs.push(
    `print:${s.print_page}`,
    `edition:${s.edition_id}`,
    `edition_hash:${s.edition_content_hash.slice(0, 16)}`,
    `content_hash:${s.source_content_hash}`,
  );
  return refs;
}

/**
 * Pure: map a validated T002 SourceBlock + Edition into evidence snapshot.
 */
export function evidenceFromSourceBlock(
  block: SourceBlock,
  edition: Edition,
): ThinkingResult<SourceEvidenceSnapshot> {
  if (!isKnownSourceId(block.sourceId)) {
    return thinkingErr("INVALID_SOURCE", `未知来源: ${block.sourceId}`);
  }
  const pdf = block.evidenceRefs.find((e) => e.kind === "pdf_page");
  if (!pdf || !Number.isFinite(pdf.pdfPage)) {
    return thinkingErr(
      "SOURCE_EVIDENCE_DRIFT",
      "SourceBlock 缺少 pdf_page 证据",
    );
  }
  if (pdf.printPage == null || !Number.isFinite(pdf.printPage)) {
    return thinkingErr(
      "SOURCE_EVIDENCE_DRIFT",
      "SourceBlock 缺少 print_page 证据",
    );
  }
  if (!block.sourceLocator?.fragment) {
    return thinkingErr(
      "SOURCE_EVIDENCE_DRIFT",
      "SourceBlock 缺少 OLL fragment locator",
    );
  }
  if (!block.contentHash || !edition.contentHash) {
    return thinkingErr(
      "SOURCE_EVIDENCE_DRIFT",
      "SourceBlock/Edition 缺少 contentHash",
    );
  }

  const input: SourceEvidenceInput = {
    source_id: block.sourceId,
    fragment: block.sourceLocator.fragment,
    pdf_page: pdf.pdfPage,
    print_page: pdf.printPage,
    edition_id: edition.editionId,
    edition_revision: edition.revision,
    edition_content_hash: edition.contentHash,
    source_content_hash: block.contentHash,
  };

  return validateAndSealSourceEvidence(input);
}

/**
 * Fail-closed validation + seal evidence_refs.
 * Rejects tampered / incomplete / drifted identity fields with zero EventStore write.
 */
export function validateAndSealSourceEvidence(
  input: SourceEvidenceInput,
): ThinkingResult<SourceEvidenceSnapshot> {
  if (!isKnownSourceId(input.source_id)) {
    return thinkingErr("INVALID_SOURCE", `未知来源: ${input.source_id}`);
  }
  if (!input.fragment || !OLL_PARAGRAPH_FRAGMENT_RE.test(input.fragment)) {
    return thinkingErr(
      "SOURCE_EVIDENCE_DRIFT",
      `无效 OLL fragment locator: ${input.fragment || "(empty)"}`,
    );
  }
  if (
    input.pdf_page !== undefined &&
    (!Number.isSafeInteger(input.pdf_page) || input.pdf_page <= 0)
  ) {
    return thinkingErr("SOURCE_EVIDENCE_DRIFT", "无效 pdf_page");
  }
  if (!Number.isSafeInteger(input.print_page) || input.print_page <= 0) {
    return thinkingErr("SOURCE_EVIDENCE_DRIFT", "无效 print_page");
  }
  if (!input.edition_id?.trim()) {
    return thinkingErr("SOURCE_EVIDENCE_DRIFT", "缺少 edition_id");
  }
  if (!input.edition_revision?.trim()) {
    return thinkingErr("SOURCE_EVIDENCE_DRIFT", "缺少 edition_revision");
  }
  if (!HASH_RE.test(input.edition_content_hash ?? "")) {
    return thinkingErr(
      "SOURCE_EVIDENCE_DRIFT",
      "edition contentHash 漂移或无效",
    );
  }
  if (!HASH_RE.test(input.source_content_hash ?? "")) {
    return thinkingErr(
      "SOURCE_EVIDENCE_DRIFT",
      "source contentHash 漂移或无效",
    );
  }

  const evidence_refs = buildEvidenceRefsFromFields(input);
  return {
    ok: true,
    value: {
      source_id: input.source_id,
      fragment: input.fragment,
      ...(input.pdf_page === undefined
        ? {}
        : { pdf_page: input.pdf_page }),
      print_page: input.print_page,
      edition_id: input.edition_id,
      edition_revision: input.edition_revision,
      edition_content_hash: input.edition_content_hash,
      source_content_hash: input.source_content_hash,
      evidence_refs,
    },
  };
}

export type ManifestSourceEvidenceEntry = Readonly<{
  block: BookSourceBlock;
  /** Legacy recipe anchors may expose their stable alias at the Agent boundary. */
  source_id?: string;
  /** Only pass a page verified against a physical PDF. */
  pdf_page?: number;
}>;

/**
 * Seals one full-book manifest paragraph against the authoritative manifest
 * entry and the content hash of the volume named by its locator.
 */
export function evidenceFromManifestSourceBlock(
  entry: ManifestSourceEvidenceEntry,
  manifest: BookManifestV2,
): ThinkingResult<SourceEvidenceSnapshot> {
  const sourceId = entry.source_id ?? entry.block.sourceId;
  if (!isKnownSourceId(sourceId)) {
    return thinkingErr("INVALID_SOURCE", `未知来源: ${sourceId}`);
  }
  const aliasTarget =
    manifest.aliases[sourceId as LegacySourceId];
  const canonicalSourceId = aliasTarget ?? sourceId;
  if (canonicalSourceId !== entry.block.sourceId) {
    return thinkingErr(
      "SOURCE_EVIDENCE_DRIFT",
      `来源别名与段落不匹配: ${sourceId}`,
    );
  }

  const authoritative = manifest.books
    .flatMap((book) => book.chapters)
    .flatMap((chapter) => chapter.sourceBlocks)
    .find((block) => block.sourceId === canonicalSourceId);
  if (
    !authoritative ||
    authoritative.contentHash !== entry.block.contentHash ||
    authoritative.quote !== entry.block.quote ||
    authoritative.printPage !== entry.block.printPage ||
    authoritative.sourceLocator.provider !==
      entry.block.sourceLocator.provider ||
    authoritative.sourceLocator.volume !==
      entry.block.sourceLocator.volume ||
    authoritative.sourceLocator.volumeId !==
      entry.block.sourceLocator.volumeId ||
    authoritative.sourceLocator.resource !==
      entry.block.sourceLocator.resource ||
    authoritative.sourceLocator.fragment !==
      entry.block.sourceLocator.fragment
  ) {
    return thinkingErr(
      "SOURCE_EVIDENCE_DRIFT",
      `Manifest SourceBlock 漂移: ${canonicalSourceId}`,
    );
  }

  const volume = manifest.volumes.find(
    (candidate) =>
      candidate.volume === authoritative.sourceLocator.volume &&
      candidate.volumeId === authoritative.sourceLocator.volumeId &&
      candidate.resource === authoritative.sourceLocator.resource,
  );
  if (!volume) {
    return thinkingErr(
      "SOURCE_EVIDENCE_DRIFT",
      `SourceBlock 缺少匹配卷册: ${canonicalSourceId}`,
    );
  }
  if (
    typeof authoritative.printPage !== "string" ||
    !/^[1-9]\d*$/u.test(authoritative.printPage)
  ) {
    return thinkingErr(
      "SOURCE_EVIDENCE_DRIFT",
      `SourceBlock 缺少 print_page 证据: ${canonicalSourceId}`,
    );
  }

  return validateAndSealSourceEvidence({
    source_id: sourceId,
    fragment: authoritative.sourceLocator.fragment,
    ...(entry.pdf_page === undefined
      ? {}
      : { pdf_page: entry.pdf_page }),
    print_page: Number(authoritative.printPage),
    edition_id: manifest.edition.editionId,
    edition_revision: manifest.edition.revision,
    edition_content_hash: volume.contentHash,
    source_content_hash: authoritative.contentHash,
  });
}

export function buildManifestSourceEvidenceMap(
  entries: readonly ManifestSourceEvidenceEntry[],
  manifest: BookManifestV2,
): ThinkingResult<SourceEvidenceMap> {
  const map: SourceEvidenceMap = {};
  for (const entry of entries) {
    const sealed = evidenceFromManifestSourceBlock(entry, manifest);
    if (!sealed.ok) return sealed;
    if (map[sealed.value.source_id]) {
      return thinkingErr(
        "SOURCE_EVIDENCE_DRIFT",
        `重复来源证据: ${sealed.value.source_id}`,
      );
    }
    map[sealed.value.source_id] = sealed.value;
  }
  return { ok: true, value: map };
}

/** Stable compare key for source+evidence identity (not text). */
export function evidenceIdentityKey(
  sourceId: string,
  evidenceRefs: readonly string[],
): string {
  return `${sourceId}::${[...evidenceRefs].sort().join("|")}`;
}

/** Serializable map for client Provider (built on server from BookArtifact). */
export type SourceEvidenceMap = Record<string, SourceEvidenceSnapshot>;

export function buildSourceEvidenceMap(
  blocks: readonly SourceBlock[],
  edition: Edition,
): ThinkingResult<SourceEvidenceMap> {
  const map: SourceEvidenceMap = {};
  for (const block of blocks) {
    const sealed = evidenceFromSourceBlock(block, edition);
    if (!sealed.ok) return sealed;
    map[sealed.value.source_id] = sealed.value;
  }
  return { ok: true, value: map };
}
