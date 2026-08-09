"use client";

/**
 * Client island: Ideas list + Relation review + BookThought in the agent rail.
 */
import { ReaderIdeaList } from "./ReaderIdeaList";
import { RelationReviewCard } from "./RelationReviewCard";
import { BookThoughtList } from "./BookThoughtList";
import { MarketReplayFixtureButton } from "./ReaderIdeaComposer";
import { useReaderThinking } from "./ReaderThinkingProvider";

export function ReaderThinkingRailIdeas() {
  return (
    <>
      <ReaderIdeaList />
      <MarketReplayFixtureButton />
    </>
  );
}

export function ReaderThinkingRailThoughts() {
  return <BookThoughtList />;
}

export function ReaderThinkingRailRelation() {
  return <RelationReviewCard />;
}

export function ThinkingStatusBanner() {
  const { status } = useReaderThinking();
  if (!status.message || status.kind === "idle") return null;
  return (
    <div
      className={`thinking-banner is-${status.kind}`}
      data-testid="thinking-banner"
      role="status"
    >
      {status.message}
    </div>
  );
}
