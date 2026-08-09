import { err, ok, type BookResult } from "./errors";
import { quoteFromBody, sourceContentHash } from "./hash";
import type {
  DomainSourceId,
  SourceBlock,
  SourceLocator,
} from "./types";
import { DOMAIN_SOURCE_IDS } from "./types";

const KNOWN_SOURCE_IDS = new Set<string>(Object.values(DOMAIN_SOURCE_IDS));

export function assertKnownSourceId(
  sourceId: string,
): BookResult<DomainSourceId> {
  if (!KNOWN_SOURCE_IDS.has(sourceId)) {
    return err("unknown_source", `Unknown source_id: ${sourceId}`, {
      sourceId,
    });
  }
  return ok(sourceId as DomainSourceId);
}

export function validateSourceBlock(block: SourceBlock): BookResult<SourceBlock> {
  const known = assertKnownSourceId(block.sourceId);
  if (!known.ok) return known;

  if (!block.sourceLocator?.fragment) {
    return err("missing_locator", "SourceBlock missing OLL fragment locator", {
      sourceId: block.sourceId,
    });
  }

  if (block.sourceLocator.provider !== "OLL") {
    return err("invalid_fragment", "Only OLL locators are supported in T002", {
      provider: block.sourceLocator.provider,
    });
  }

  // Domain id must never equal OLL fragment id.
  if (block.sourceId === block.sourceLocator.fragment) {
    return err(
      "invalid_fragment",
      "source_id must not equal OLL fragment locator",
      { sourceId: block.sourceId },
    );
  }

  const expectedQuote = quoteFromBody(block.body);
  if (block.quote !== expectedQuote) {
    return err("quote_hash_drift", "quote does not match body text nodes", {
      sourceId: block.sourceId,
      expectedQuote,
      quote: block.quote,
    });
  }

  const expectedHash = sourceContentHash(block.body, block.quote);
  if (block.contentHash !== expectedHash) {
    return err("quote_hash_drift", "contentHash does not match body/quote", {
      sourceId: block.sourceId,
      expectedHash,
      contentHash: block.contentHash,
    });
  }

  return ok(block);
}

export function validateLocatorUniqueness(
  locators: SourceLocator[],
): BookResult<SourceLocator[]> {
  const seen = new Map<string, number>();
  for (const loc of locators) {
    if (!loc.fragment) {
      return err("missing_locator", "Empty fragment in locator list");
    }
    const key = `${loc.provider}:${loc.resource}#${loc.fragment}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seen) {
    if (count > 1) {
      return err("duplicate_locator", `Duplicate locator: ${key}`, {
        key,
        count,
      });
    }
  }
  return ok(locators);
}

export function getSourceBlockById(
  blocks: SourceBlock[],
  sourceId: string,
): BookResult<SourceBlock> {
  const known = assertKnownSourceId(sourceId);
  if (!known.ok) return known;

  const found = blocks.find((b) => b.sourceId === sourceId);
  if (!found) {
    return err("source_unavailable", `Source not available: ${sourceId}`, {
      sourceId,
    });
  }
  return validateSourceBlock(found);
}
