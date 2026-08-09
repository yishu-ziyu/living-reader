/** Injectable identity / clock for deterministic tests (no Date.now / random). */

import type { SourceDiscussionSnapshot } from "@/modules/agent-os/companion";

export type IdPort = {
  nextId: (prefix: string) => string;
};

export type ClockPort = {
  nowRfc3339: () => string;
};

/**
 * F38: canonical SourceDiscussionSnapshot authority (sealed T002 map from ReadingShell).
 * Commands must never treat client-reported snapshots as truth.
 */
export type SourceDiscussionResolverPort = {
  get: (source_id: string) => SourceDiscussionSnapshot | null;
};

/** Map-backed resolver for tests + browser (discussionSnapshots from loadWealthOfNationsBook). */
export function createMapSourceDiscussionResolver(
  map: Readonly<Record<string, SourceDiscussionSnapshot>>,
): SourceDiscussionResolverPort {
  return {
    get: (source_id: string) => {
      if (!source_id || typeof source_id !== "string") return null;
      return map[source_id] ?? null;
    },
  };
}

let seq = 0;

export function createSequentialIdPort(start = 0): IdPort {
  let n = start;
  return {
    nextId: (prefix: string) => {
      n += 1;
      return `${prefix}_${n}`;
    },
  };
}

export function createFixedClockPort(iso = "2026-08-09T00:00:00.000Z"): ClockPort {
  return { nowRfc3339: () => iso };
}

/** Browser default: deterministic counter + real ISO (ids only sequential). */
export function createBrowserIdPort(): IdPort {
  return {
    nextId: (prefix: string) => {
      seq += 1;
      return `${prefix}_${seq}_${Math.floor(performance.now())}`;
    },
  };
}

export function createBrowserClockPort(): ClockPort {
  return {
    nowRfc3339: () => new Date().toISOString(),
  };
}
