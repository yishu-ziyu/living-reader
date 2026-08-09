"use client";

import { useReaderThinking } from "./ReaderThinkingProvider";
import { useReaderSession } from "./ReaderSessionProvider";
import { InlineWorldBlock } from "@/modules/world/components";

export function WorldSlotFromSession() {
  const { worldSlotState, state } = useReaderSession();
  const thinking = useReaderThinking();
  const plan = thinking.worldPresentation;
  const evidence = thinking.worldEvidence;
  const loading =
    thinking.worldUiState === "constructing" &&
    (plan === null || evidence === null);
  const visible =
    loading ||
    (plan !== null &&
      evidence !== null &&
      (thinking.worldUiState === "constructing" ||
        thinking.worldUiState === "open"));

  const returnToSource = (sourceId: string) => {
    const sourceIds = [sourceId, plan?.source.legacy_source_id].filter(
      (value): value is string => Boolean(value),
    );
    const target = Array.from(
      document.querySelectorAll<HTMLElement>("[data-source-id][data-source-key]"),
    ).find((element) => sourceIds.includes(element.dataset.sourceId ?? ""));
    target?.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        target?.focus({ preventScroll: true });
      });
    });
  };

  return (
    <>
      {plan !== null && evidence !== null && !visible ? (
        <button
          className="world-reopen"
          data-testid="world-reopen"
          onClick={thinking.reopenWorld}
          type="button"
        >
          重新打开刚才的世界
        </button>
      ) : null}
      <section
        className="world-slot"
        id="worldSlot"
        data-testid="world-slot"
        data-state={
          visible && worldSlotState === "closed" ? "open" : worldSlotState
        }
        data-session-state={state}
        aria-hidden={!visible}
        hidden={!visible}
      >
        {loading ? (
          <InlineWorldBlock
            onCollapse={thinking.collapseWorld}
            state="loading"
          />
        ) : plan && evidence ? (
          <InlineWorldBlock
            evidence={evidence}
            actionPending={thinking.worldActionPending}
            onAction={(actionId) => {
              void thinking.actInWorld(actionId);
            }}
            onCollapse={() => {
              thinking.collapseWorld();
              returnToSource(plan.source.source_id);
            }}
            onConstructionComplete={thinking.completeWorldConstruction}
            onReturnToSource={returnToSource}
            plan={plan}
            state={
              thinking.worldUiState === "constructing"
                ? "constructing"
                : "open"
            }
          />
        ) : null}
      </section>
    </>
  );
}
