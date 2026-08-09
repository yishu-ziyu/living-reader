import type { CommittedWorldPresentation } from "@/modules/world";
import styles from "./evidence-block.module.css";

type PresentationBindings = CommittedWorldPresentation["bindings"];
type CommittedWorldEvent = CommittedWorldPresentation["events"][number];

export type EvidenceBlockProps = {
  sources: PresentationBindings["sources"];
  relations: PresentationBindings["relations"];
  evidence: PresentationBindings["evidence"];
  events: readonly CommittedWorldEvent[];
  worldRevision: CommittedWorldPresentation["basis"]["world_revision"];
  rulesetId: CommittedWorldPresentation["basis"]["ruleset_id"];
  seed: CommittedWorldPresentation["basis"]["seed"];
  onReturnToSource?: (sourceId: string) => void;
  returnSourceId?: string;
  returnActionTestId?: string;
};

/**
 * Displays sealed source, relation, event and runtime audit data carried by
 * the committed presentation. It deliberately has no resolver or model-facing
 * inputs.
 */
export function EvidenceBlock({
  sources,
  relations,
  evidence,
  events,
  worldRevision,
  rulesetId,
  seed,
  onReturnToSource,
  returnSourceId,
  returnActionTestId = "evidence-return-source",
}: EvidenceBlockProps) {
  const sourcesById = new Map(
    sources.map((source) => [source.source_id, source]),
  );
  const eventsById = new Map(events.map((event) => [event.message_id, event]));
  const citedSources = evidence.source_ids.flatMap((sourceId) => {
    const source = sourcesById.get(sourceId);
    return source ? [source] : [];
  });
  const citedEvents = evidence.event_message_ids.flatMap((eventId) => {
    const event = eventsById.get(eventId);
    return event ? [event] : [];
  });
  const returnSource = returnSourceId
    ? sourcesById.get(returnSourceId)
    : undefined;

  return (
    <details
      className={styles.block}
      data-source-id={returnSource?.source_id}
      data-source-locator={returnSource?.fragment}
      data-testid="evidence-block"
    >
      <summary data-testid="evidence-toggle">查看依据</summary>
      <div className={styles.content}>
        <section aria-labelledby="evidence-sources-title">
          <h3 id="evidence-sources-title">原文</h3>
          <ol>
            {citedSources.map((source) => {
              const isReturnSource = source.source_id === returnSource?.source_id;

              return (
                <li
                  data-testid={`evidence-source-${source.source_id}`}
                  key={source.source_id}
                >
                  <p>
                    <code>{source.source_id}</code> · PDF {source.pdf_page} · OLL{" "}
                    <code>{source.fragment}</code>
                  </p>
                  <blockquote
                    data-evidence-field={isReturnSource ? "quote" : undefined}
                    data-testid={`evidence-quote-${source.source_id}`}
                  >
                    {source.quote}
                  </blockquote>
                  {isReturnSource && onReturnToSource ? (
                    <button
                      data-testid={returnActionTestId}
                      onClick={() => onReturnToSource(source.source_id)}
                      type="button"
                    >
                      回到原文
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-labelledby="evidence-relations-title">
          <h3 id="evidence-relations-title">已确认关系</h3>
          <ol>
            {relations.map((relation) => (
              <li
                data-testid={`evidence-relation-${relation.relation_id}`}
                key={relation.relation_id}
              >
                <code>{relation.relation_type}</code> · {relation.from_id} →{" "}
                {relation.to_id}
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="evidence-events-title">
          <h3 id="evidence-events-title">已提交事件</h3>
          <ol>
            {citedEvents.map((event, index) => (
              <li
                data-actor-id={event.actor_id ?? undefined}
                data-event-sequence={event.event_index_in_commit}
                data-evidence-field={index === 0 ? "event" : undefined}
                data-testid={`evidence-event-${event.message_id}`}
                data-world-revision={event.world_revision}
                key={event.message_id}
              >
                <p>{event.summary}</p>
                <small>
                  <code>{event.message_name}</code> · {event.message_id}
                </small>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="evidence-refs-title">
          <h3 id="evidence-refs-title">证据引用</h3>
          <ul>
            {evidence.evidence_refs.map((reference) => (
              <li key={reference}>
                <code>{reference}</code>
              </li>
            ))}
          </ul>
        </section>
        <section
          aria-labelledby="evidence-runtime-title"
          data-testid="evidence-runtime"
        >
          <h3 id="evidence-runtime-title">运行依据</h3>
          <dl>
            <div>
              <dt>世界修订</dt>
              <dd data-testid="evidence-world-revision">{worldRevision}</dd>
            </div>
            <div>
              <dt>规则集 ID</dt>
              <dd data-testid="evidence-ruleset-id">
                <code>{rulesetId}</code>
              </dd>
            </div>
            <div>
              <dt>随机种子</dt>
              <dd data-testid="evidence-seed">
                <code>{seed}</code>
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </details>
  );
}
