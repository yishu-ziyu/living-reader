"use client";

import type { CSSProperties } from "react";
import { EvidenceBlock } from "@/modules/evidence";
import type { CommittedWorldPresentation } from "@/modules/world";
import styles from "./inline-world-block.module.css";

const FRAME_HEIGHT_PX = 600;

const ROLE_LABELS = {
  merchant: "商人",
  shepherd: "牧羊人",
  spinner: "纺工",
  weaver: "织工",
} as const;

const METRIC_LABELS = {
  supply: "供给",
  inventory: "库存",
  demand: "可触达订单",
  cash: "现金",
} as const;

type InlineWorldBlockProps =
  | {
      state: "loading";
      presentation?: never;
      onCollapse: () => void;
      onReturnToSource?: (sourceId: string) => void;
      returnSourceId?: string;
      returnActionTestId?: string;
    }
  | {
      state: "open";
      presentation: CommittedWorldPresentation;
      onCollapse: () => void;
      onReturnToSource?: (sourceId: string) => void;
      returnSourceId?: string;
      returnActionTestId?: string;
    };

/**
 * A book-native, read-only projection of committed world facts.
 * Loading contains no world facts; open requires the validated presentation.
 */
export function InlineWorldBlock(props: InlineWorldBlockProps) {
  const { state, onCollapse } = props;
  const presentation = state === "open" ? props.presentation : null;
  const frameStyle = {
    "--inline-world-frame-height": `${FRAME_HEIGHT_PX}px`,
  } as CSSProperties;

  return (
    <section
      aria-busy={state === "loading"}
      aria-label="原文中的可运行世界"
      className={styles.frame}
      data-component="inline-world-block"
      data-state={state}
      data-testid="world-action-surface"
      data-world-revision={presentation?.basis.world_revision}
      data-world-state={state}
      style={frameStyle}
    >
      {presentation ? (
        <OpenWorld
          onCollapse={onCollapse}
          onReturnToSource={props.onReturnToSource}
          presentation={presentation}
          returnActionTestId={props.returnActionTestId}
          returnSourceId={props.returnSourceId}
        />
      ) : (
        <LoadingWorld onCollapse={onCollapse} />
      )}
    </section>
  );
}

function LoadingWorld({ onCollapse }: { onCollapse: () => void }) {
  return (
    <>
      <header className={styles.header}>
        <div>
          <p className={styles.overline}>已提交世界</p>
          <h2>正在整理可核对的事件</h2>
        </div>
        <button
          className={styles.collapseButton}
          data-testid="world-collapse"
          onClick={onCollapse}
          type="button"
        >
          收起世界
        </button>
      </header>
      <div className={styles.loadingBody} data-testid="world-loading-body">
        <p>世界仍留在这两段原文之间；加载不会改变阅读位置。</p>
      </div>
    </>
  );
}

function OpenWorld({
  presentation,
  onCollapse,
  onReturnToSource,
  returnSourceId,
  returnActionTestId,
}: {
  presentation: CommittedWorldPresentation;
  onCollapse: () => void;
  onReturnToSource?: (sourceId: string) => void;
  returnSourceId?: string;
  returnActionTestId?: string;
}) {
  return (
    <>
      <header className={styles.header}>
        <div>
          <p className={styles.overline}>已提交世界</p>
          <h2>针厂的边界</h2>
        </div>
        <button
          className={styles.collapseButton}
          data-testid="world-collapse"
          onClick={onCollapse}
          type="button"
        >
          收起世界
        </button>
      </header>

      <div className={styles.content}>
        <section
          aria-label="当前已提交状态"
          className={styles.metrics}
          data-testid="world-metrics"
        >
          <h3>当前已提交状态</h3>
          <dl>
            {(Object.keys(METRIC_LABELS) as Array<keyof typeof METRIC_LABELS>).map(
              (metric) => (
                <div key={metric}>
                  <dt>{METRIC_LABELS[metric]}</dt>
                  <dd
                    data-metric-key={metric}
                    data-metric-value={presentation.metrics[metric]}
                    data-testid={`world-metric-${metric}`}
                  >
                    {presentation.metrics[metric]}
                  </dd>
                </div>
              ),
            )}
          </dl>
        </section>

        <section aria-labelledby="world-roles-title" className={styles.roles}>
          <h3 id="world-roles-title">角色观察</h3>
          <ol>
            {presentation.roles.map((role) => (
              <li
                data-actor-id={role.actor_id}
                data-testid={`world-actor-${role.actor_id}`}
                key={role.actor_id}
              >
                <strong>{ROLE_LABELS[role.actor_id]}</strong>
                {role.observation ? (
                  <p>{role.observation.summary}</p>
                ) : (
                  <p>尚无已提交观察。</p>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="world-events-title" className={styles.events}>
          <h3 id="world-events-title">已提交事件</h3>
          <ol
            aria-label="按提交顺序排列的世界事件"
            className={styles.eventFeed}
            data-testid="world-event-feed"
            tabIndex={0}
          >
            {presentation.events.map((event) => (
              <li
                data-actor-id={event.actor_id ?? undefined}
                data-event-sequence={event.event_index_in_commit}
                data-stream-version={event.stream_version}
                data-testid={`world-event-row-${event.message_id}`}
                data-world-revision={event.world_revision}
                key={event.message_id}
              >
                <p>{event.summary}</p>
              </li>
            ))}
          </ol>
        </section>

        <EvidenceBlock
          evidence={presentation.bindings.evidence}
          events={presentation.events}
          worldRevision={presentation.basis.world_revision}
          rulesetId={presentation.basis.ruleset_id}
          seed={presentation.basis.seed}
          onReturnToSource={onReturnToSource}
          relations={presentation.bindings.relations}
          returnActionTestId={returnActionTestId}
          returnSourceId={returnSourceId}
          sources={presentation.bindings.sources}
        />
      </div>
    </>
  );
}

export { FRAME_HEIGHT_PX as INLINE_WORLD_FRAME_HEIGHT_PX };
export type { InlineWorldBlockProps };
