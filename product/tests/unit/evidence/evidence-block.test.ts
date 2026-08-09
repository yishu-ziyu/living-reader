import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EvidenceBlock } from "@/modules/evidence";
import { committedWorldPresentationFixture } from "../world/committed-world-presentation.fixture";

describe("T010 EvidenceBlock", () => {
  it("keeps exact sealed source quotes, locators and committed events together", () => {
    const presentation = committedWorldPresentationFixture();
    const html = renderToStaticMarkup(
      createElement(EvidenceBlock, {
        sources: presentation.bindings.sources,
        relations: presentation.bindings.relations,
        evidence: presentation.bindings.evidence,
        events: presentation.events,
        worldRevision: presentation.basis.world_revision,
        rulesetId: presentation.basis.ruleset_id,
        seed: presentation.basis.seed,
        onReturnToSource: () => undefined,
        returnActionTestId: "evidence-return-market",
        returnSourceId: "smith.b1.c3.market_extent",
      }),
    );

    expect(html).toContain('data-testid="evidence-block"');
    expect(html).toContain('data-source-id="smith.b1.c3.market_extent"');
    expect(html).toContain('data-source-locator="Smith_0206-01_426"');
    expect(html).toContain('data-testid="evidence-toggle"');
    expect(html).toContain('data-testid="evidence-source-smith.b1.c1.division"');
    expect(html).toContain('Smith_0206-01_235');
    expect(html).toContain('PDF 36');
    expect(html).toContain(
      "The greatest improvements in the productive powers of labour.",
    );
    expect(html).toContain('Smith_0206-01_426');
    expect(html).toContain(
      "The division of labour is limited by the extent of the market.",
    );
    expect(html).toContain('data-evidence-field="quote"');
    expect(html).toContain('data-testid="evidence-return-market"');
    expect(html).toContain(
      `data-testid="evidence-event-${presentation.events[0]!.message_id}"`,
    );
    expect(html).toContain('data-evidence-field="event"');
    expect(html).toContain('data-event-sequence="0"');
    expect(html).toContain('reader_world.world.event_recorded.v1');
    expect(html).toContain(presentation.events.at(-1)!.message_id);
  });

  it("keeps runtime audit fields inside the closed evidence disclosure", () => {
    const presentation = committedWorldPresentationFixture();
    const html = renderToStaticMarkup(
      createElement(EvidenceBlock, {
        sources: presentation.bindings.sources,
        relations: presentation.bindings.relations,
        evidence: presentation.bindings.evidence,
        events: presentation.events,
        worldRevision: presentation.basis.world_revision,
        rulesetId: presentation.basis.ruleset_id,
        seed: presentation.basis.seed,
      }),
    );
    const detailsStart = html.indexOf("<details");
    const detailsTagEnd = html.indexOf(">", detailsStart);
    const summaryEnd = html.indexOf("</summary>");

    expect(detailsStart).toBeGreaterThanOrEqual(0);
    expect(detailsTagEnd).toBeGreaterThan(detailsStart);
    expect(html.slice(detailsStart, detailsTagEnd)).not.toContain(" open");
    expect(summaryEnd).toBeGreaterThan(detailsTagEnd);
    expect(html.slice(detailsStart, summaryEnd)).not.toContain("wool-town-v1");
    expect(html.slice(detailsStart, summaryEnd)).not.toContain(">1</dd>");
    expect(html.slice(detailsStart, summaryEnd)).not.toContain(">42</dd>");
    expect(html).toContain('data-testid="evidence-runtime"');
    expect(html).toContain('data-testid="evidence-world-revision">1</dd>');
    expect(html).toContain(
      'data-testid="evidence-ruleset-id"><code>wool-town-v1</code>',
    );
    expect(html).toContain('data-testid="evidence-seed"><code>42</code>');
    expect(html.indexOf('data-testid="evidence-runtime"')).toBeGreaterThan(
      summaryEnd,
    );
  });
});
