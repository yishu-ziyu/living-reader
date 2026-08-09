import { DOMAIN_SOURCE_IDS, type DomainSourceId } from "./types";

const CANONICAL_SOURCE_ID_RE =
  /^smith\.b[1-5]\.c(?:0|[1-9]\d*)\.p[1-9]\d*$/u;

export function isDomainSourceId(
  sourceId: string,
): sourceId is DomainSourceId {
  return (
    sourceId === DOMAIN_SOURCE_IDS.division ||
    sourceId === DOMAIN_SOURCE_IDS.market ||
    CANONICAL_SOURCE_ID_RE.test(sourceId)
  );
}
