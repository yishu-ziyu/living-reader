/**
 * Reader thinking — ReaderIdea commands + constants.
 * Facts live in EventStore; this module never mutates projections directly.
 */
export { EMPTY_READER_IDEAS } from "./placeholder";
export type { ReaderIdeaPlaceholder } from "./placeholder";
export * from "./constants";
export * from "./errors";
export * from "./ports";
// SourceDiscussionResolverPort + createMapSourceDiscussionResolver via ports
export * from "./source-evidence";
export {
  submitIdea,
  reviseIdea,
  reloadGraph,
  type IdeaCommandPorts,
  type SubmitIdeaInput,
  type SubmitIdeaOutput,
  type ReviseIdeaInput,
} from "./idea-commands";
export {
  acceptBookThought,
  reviseBookThought,
  isSourceDiscussionSnapshot,
  parseSourceDiscussionSnapshot,
  snapshotsMatch,
  type BookThoughtPorts,
  type AcceptBookThoughtInput,
  type AcceptBookThoughtOutput,
  type ReviseBookThoughtInput,
} from "./book-thought-commands";
