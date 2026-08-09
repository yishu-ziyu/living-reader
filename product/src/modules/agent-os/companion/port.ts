import type {
  CompanionProviderCandidate,
  SourceDiscussionRequest,
} from "./types";

/**
 * Companion provider — discuss only. No EventStore writes.
 * Production MVP uses deterministic fixture (no network / keys).
 */
export type CompanionProviderPort = {
  discuss: (
    request: SourceDiscussionRequest,
  ) => Promise<CompanionProviderCandidate>;
};
