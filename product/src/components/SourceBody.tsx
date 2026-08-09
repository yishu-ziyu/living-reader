import type { BodyNode, Footnote } from "@/modules/book/domain";

/** Renders structured OLL body: text, footnote markers, margin notes. */
export function SourceBody({
  body,
  footnotes = [],
}: {
  body: BodyNode[];
  footnotes?: Footnote[];
}) {
  return (
    <>
      {body.map((node, i) => {
        if (node.type === "text") {
          return <span key={`t-${i}`}>{node.text}</span>;
        }
        if (node.type === "footnote_ref") {
          const target = footnotes.find((f) => f.id === node.targetId);
          const fnDomId = `fn-${node.targetId}`;
          return (
            <a
              key={`f-${i}`}
              id={node.id}
              href={`#${fnDomId}`}
              className="footnote-marker"
              data-testid={`footnote-ref-${node.targetId}`}
              data-footnote-target={node.targetId}
              aria-label={
                target
                  ? `脚注 ${node.marker}: ${target.text}`
                  : `脚注 ${node.marker}（目标不可用）`
              }
              title={target?.text}
            >
              {node.marker}
            </a>
          );
        }
        // span only: margin notes may sit inside quote <p>
        return (
          <span key={`m-${i}`} className="inline-margin-note">
            {node.text}
          </span>
        );
      })}
    </>
  );
}

/** Accessible footnote targets for refs used on the page. */
export function FootnoteList({
  footnotes,
  testId,
}: {
  footnotes: Footnote[];
  testId?: string;
}) {
  if (!footnotes.length) return null;
  return (
    <section
      className="footnote-list"
      aria-label="脚注"
      data-testid={testId ?? "footnote-list"}
    >
      <h3 className="footnote-list-title">脚注</h3>
      <ol>
        {footnotes.map((fn) => (
          <li
            key={fn.id}
            id={`fn-${fn.id}`}
            data-testid={`footnote-target-${fn.id}`}
            data-footnote-id={fn.id}
          >
            <a
              className="footnote-backref"
              href={fn.backRefId ? `#${fn.backRefId}` : undefined}
            >
              {fn.marker}
            </a>{" "}
            <span>{fn.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
