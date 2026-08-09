# ReaderThinking + Relation Review (T005)

## Fact source

EventStore is the only fact source. UI and ReaderSession never invent GraphCommitted / relation decisions.

## Commands

| Command | Events written |
|---------|----------------|
| submitIdea | `reader_world.reader_idea.proposed.v1` (revision=1) |
| reviseIdea | `reader_world.reader_idea.proposed.v1` (revision+1, supersedes=idea_id) |
| proposeCanonicalRelation | `reader_world.relation.proposed.v1` |
| reviseRelation | `relation.reviewed(revised)` + new `relation.proposed` (same append) |
| rejectRelation | `relation.reviewed(rejected)` only — **no auto-repropose** |
| reproposeRelation | user-explicit `relation.proposed` |
| acceptAndCommitRelation | `relation.reviewed(accepted)` + `graph.committed` **same append** |

## Basis & stale

- `idea_basis_revision` = count of `reader_idea.proposed` events in stream.
- Relation `basis_revision` set at propose time to current idea_basis_revision.
- Relation / graph **stale** when idea_basis_revision > relation.basis_revision.
- On stale after prior accept: session receives `GRAPH_BASIS_INVALIDATED` → active.reading, clear graph/gate/world, bump generation.

## Canonical fixture

Pure function: when active Ideas exist for `smith.b1.c1.division` and `smith.b1.c3.market_extent`, propose `constrained_by` (专业化受市场范围限制). No LLM.

## Public session API

Only `safeAttemptTransition` / `useReaderSession().send`. New event: `GRAPH_BASIS_INVALIDATED`.

## Out of scope

Voice, ASR, LLM, WorldKernel, PLAYABILITY_PASSED / world open, T006+.
