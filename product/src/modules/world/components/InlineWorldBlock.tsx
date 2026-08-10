"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { EvidenceBlock } from "@/modules/evidence";
import type {
  CommittedWorldPresentation,
  PresentationPlan,
  WorldMetrics,
} from "@/modules/world";
import styles from "./inline-world-block.module.css";
import { WalkView } from "./WalkView";

const FRAME_HEIGHT_PX = 600;


const METRIC_LABELS = {
  supply: "供给",
  inventory: "库存",
  demand: "可触达订单",
  cash: "现金",
} as const;

type SharedProps = {
  onCollapse: () => void;
  onReturnToSource?: (sourceId: string) => void;
  returnSourceId?: string;
  returnActionTestId?: string;
};

type InlineWorldBlockProps =
  | (SharedProps & {
      state: "loading";
      plan?: never;
      evidence?: never;
    })
  | (SharedProps & {
      state: "constructing" | "open";
      plan: PresentationPlan;
      evidence: CommittedWorldPresentation;
      actionPending?: boolean;
      onAction?: (actionId: string) => void;
      onConstructionComplete?: () => void;
    });

type PlannedWorldProps = Extract<
  InlineWorldBlockProps,
  { plan: PresentationPlan }
>;

function hasPlan(props: InlineWorldBlockProps): props is PlannedWorldProps {
  return "plan" in props && props.plan !== undefined;
}

/**
 * The book-native world renderer. Committed data enters through a renderer-
 * independent plan; DOM/CSS owns construction, action feedback, and a11y.
 */
export function InlineWorldBlock(props: InlineWorldBlockProps) {
  const plan = hasPlan(props) ? props.plan : null;
  const frameStyle = {
    "--inline-world-frame-height": `${FRAME_HEIGHT_PX}px`,
  } as CSSProperties;

  return (
    <section
      aria-busy={props.state === "loading" || props.state === "constructing"}
      aria-label="原文中的可运行世界"
      className={styles.frame}
      data-component="inline-world-block"
      data-state={props.state}
      data-testid="world-action-surface"
      data-world-revision={plan?.basis.world_revision}
      data-world-state={props.state}
      id="inline-reader-world"
      style={frameStyle}
    >
      {hasPlan(props) ? (
        <PlanWorld
          actionPending={props.actionPending}
          evidence={props.evidence}
          onAction={props.onAction}
          onCollapse={props.onCollapse}
          onConstructionComplete={props.onConstructionComplete}
          onReturnToSource={props.onReturnToSource}
          plan={props.plan}
          returnActionTestId={props.returnActionTestId}
          returnSourceId={props.returnSourceId}
          state={props.state}
        />
      ) : (
        <LoadingWorld onCollapse={props.onCollapse} />
      )}
    </section>
  );
}

function WorldBuildIndicator({
  label,
  stage,
}: {
  label: string;
  stage: number;
}) {
  return (
    <div
      aria-label={label}
      className={styles.buildIndicator}
      data-stage={stage}
      data-testid="world-construction-indicator"
      role="img"
    >
      <span />
      <span />
      <span />
    </div>
  );
}

function LoadingWorld({ onCollapse }: { onCollapse: () => void }) {
  return (
    <>
      <header className={styles.header}>
        <div>
          <p className={styles.overline}>正在建造</p>
          <h2>把已确认的关系编译成世界</h2>
        </div>
        <button
          className={styles.collapseButton}
          data-testid="world-collapse"
          onClick={onCollapse}
          type="button"
        >
          收起
        </button>
      </header>
      <div className={styles.loadingBody} data-testid="world-loading-body">
        <WorldBuildIndicator label="正在编译世界" stage={0} />
        <p>规则、角色与材料流会在这段原文下方依次出现。</p>
      </div>
    </>
  );
}

const CONSTRUCTION_LABELS = [
  "正在固定规则与初始数值",
  "角色进入，库存就位",
  "材料流开始连接",
  "世界可以操作",
] as const;


function PlanWorld({
  plan,
  evidence,
  state,
  actionPending = false,
  onAction,
  onCollapse,
  onConstructionComplete,
  onReturnToSource,
  returnActionTestId,
  returnSourceId,
}: {
  evidence: CommittedWorldPresentation;
  plan: PresentationPlan;
  state: "constructing" | "open";
  actionPending?: boolean;
  onAction?: (actionId: string) => void;
  onCollapse: () => void;
  onConstructionComplete?: () => void;
  onReturnToSource?: (sourceId: string) => void;
  returnActionTestId?: string;
  returnSourceId?: string;
}) {
  const [constructionStage, setConstructionStage] = useState(
    state === "open" ? 3 : 0,
  );

  useEffect(() => {
    if (state !== "constructing") return;
    const reduced = plan.motion_mode === "reduced";
    const schedule = reduced ? [0, 40, 80] : [220, 560, 940];
    const timers = schedule.map((delay, index) =>
      window.setTimeout(() => setConstructionStage(index + 1), delay),
    );
    const completion = window.setTimeout(
      () => onConstructionComplete?.(),
      reduced ? 120 : 1_160,
    );
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(completion);
    };
  }, [
    onConstructionComplete,
    plan.basis.recipe_fingerprint,
    plan.motion_mode,
    state,
  ]);

  const observations = useMemo(() => {
    const latest = new Map<string, (typeof plan.timeline)[number]>();
    for (const event of plan.timeline) latest.set(event.actor_id, event);
    return latest;
  }, [plan]);
  const visibleConstructionStage = state === "open" ? 3 : constructionStage;
  const ready = visibleConstructionStage >= 3;
  const sourceIdForReturn = returnSourceId ?? plan.source.legacy_source_id;

  return (
    <>
      <header className={styles.header}>
        <div className={styles.worldHeading}>
          <WorldBuildIndicator
            label={CONSTRUCTION_LABELS[visibleConstructionStage]}
            stage={visibleConstructionStage}
          />
          <div>
            <p className={styles.overline}>
              {state === "constructing" ? "正在建造" : "可执行世界"}
            </p>
            <h2>{plan.scene.title}</h2>
            <p
              aria-live="polite"
              className={styles.constructionStatus}
              data-testid="world-construction-stage"
            >
              {CONSTRUCTION_LABELS[visibleConstructionStage]}
            </p>
          </div>
        </div>
        <button
          className={styles.collapseButton}
          data-testid="world-collapse"
          onClick={onCollapse}
          type="button"
        >
          收起
        </button>
      </header>

      <div className={styles.content}>
        <p className={styles.mechanismSummary}>{plan.scene.summary}</p>

        {visibleConstructionStage >= 1 ? (
          <section
            aria-label="角色与库存"
            className={styles.worldScene}
            data-testid="world-scene"
          >
            {plan.walk ? <WalkView walk={plan.walk} /> : null}
            <div className={styles.actorLine}>
              {plan.entities.map((entity) => {
                const observation = observations.get(entity.actor_id);
                return (
                  <article
                    className={styles.actor}
                    data-active={observation ? "true" : "false"}
                    data-actor-id={entity.actor_id}
                    data-testid={`world-actor-${entity.actor_id}`}
                    key={entity.actor_id}
                  >
                    <span aria-hidden="true" className={styles.actorMark}>
                      {entity.label.slice(0, 1)}
                    </span>
                    <strong>{entity.label}</strong>
                    <small>{entity.role}</small>
                    {observation ? <p>{observation.caption}</p> : null}
                  </article>
                );
              })}
            </div>

            <div aria-label="库存" className={styles.stockShelf}>
              {plan.stocks.map((stock) => (
                <div
                  className={styles.stock}
                  data-stock-id={stock.id}
                  key={stock.id}
                >
                  <span>{stock.label}</span>
                  <strong>{plan.metrics[metricKey(stock.metric_id)]}</strong>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {visibleConstructionStage >= 2 ? (
          <section aria-label="材料流" className={styles.flowSection}>
            <div className={styles.flowRail}>
              {plan.flows.map((flow) => (
                <div
                  className={styles.flow}
                  data-flow-id={flow.id}
                  key={`${plan.basis.world_revision}:${flow.id}`}
                >
                  <span>{flow.label}</span>
                  <span aria-hidden="true" className={styles.flowTrack}>
                    <i className={styles.materialToken} />
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {ready ? (
          <>
            <section
              aria-label="当前世界状态"
              className={styles.metrics}
              data-testid="world-metrics"
            >
              <h3>这一刻的世界</h3>
              <dl>
                {(Object.keys(METRIC_LABELS) as Array<keyof typeof METRIC_LABELS>).map(
                  (metric) => (
                    <div key={metric}>
                      <dt>{METRIC_LABELS[metric]}</dt>
                      <dd
                        data-metric-key={metric}
                        data-metric-value={plan.metrics[metric]}
                        data-testid={`world-metric-${metric}`}
                      >
                        {plan.metrics[metric]}
                      </dd>
                    </div>
                  ),
                )}
              </dl>
            </section>

            {plan.actions.length > 0 ? (
              <section aria-labelledby="world-actions-title" className={styles.actions}>
                <div>
                  <h3 id="world-actions-title">你要改变什么？</h3>
                  <p>动作会先进入规则引擎，再把提交后的结果带回这里。</p>
                </div>
                <div className={styles.actionButtons}>
                  {plan.actions.map((action) => (
                    <button
                      aria-describedby={`world-action-description-${action.action_id}`}
                      data-action-id={action.action_id}
                      data-testid={`world-action-${action.action_id}`}
                      disabled={actionPending || !onAction}
                      key={action.action_id}
                      onClick={() => onAction?.(action.action_id)}
                      type="button"
                    >
                      <strong>{actionPending ? "世界正在回应…" : action.label}</strong>
                      <small id={`world-action-description-${action.action_id}`}>
                        {action.description}
                      </small>
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <section
                aria-labelledby="world-read-only-title"
                className={styles.actions}
                data-testid="world-read-only"
              >
                <div>
                  <h3 id="world-read-only-title">旧世界回放</h3>
                  <p>这段世界来自旧版记录，只能回看，不能继续改动。</p>
                </div>
              </section>
            )}

            <section aria-labelledby="world-events-title" className={styles.events}>
              <h3 id="world-events-title">刚刚发生</h3>
              {plan.timeline.length > 0 ? (
                <ol
                  aria-label="按因果顺序排列的世界事件"
                  className={styles.eventFeed}
                  data-testid="world-event-feed"
                  tabIndex={0}
                >
                  {plan.timeline.map((event) => (
                    <li
                      data-actor-id={event.actor_id}
                      data-event-sequence={event.index}
                      data-testid={`world-event-row-${event.index}`}
                      data-world-revision={plan.basis.world_revision}
                      key={`${event.index}:${event.event_kind}`}
                    >
                      <span>{event.motion_verb}</span>
                      <p>{event.caption}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.emptyEvent}>等待你的第一个动作。</p>
              )}
            </section>

            <EvidenceBlock
              evidence={evidence.bindings.evidence}
              events={evidence.events}
              onReturnToSource={onReturnToSource}
              relations={evidence.bindings.relations}
              returnActionTestId={returnActionTestId}
              returnSourceId={sourceIdForReturn}
              rulesetId={evidence.basis.ruleset_id}
              seed={evidence.basis.seed}
              sources={evidence.bindings.sources}
              worldRevision={evidence.basis.world_revision}
            />

            <details className={styles.domSummary}>
              <summary>查看无动画文字摘要</summary>
              <ul>
                {plan.dom_summary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          </>
        ) : null}
      </div>
    </>
  );
}

function metricKey(
  metricId: keyof WorldMetrics,
): keyof PresentationPlan["metrics"] {
  const keys = {
    output: "supply",
    stock: "inventory",
    reachable_orders: "demand",
    cash: "cash",
  } as const;
  return keys[metricId];
}


export { FRAME_HEIGHT_PX as INLINE_WORLD_FRAME_HEIGHT_PX };
export type { InlineWorldBlockProps };
