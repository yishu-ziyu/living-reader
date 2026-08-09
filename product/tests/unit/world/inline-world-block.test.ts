import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  InlineWorldBlock,
  INLINE_WORLD_FRAME_HEIGHT_PX,
} from "@/modules/world/components";
import { committedWorldPresentationFixture } from "./committed-world-presentation.fixture";

function positionOf(html: string, value: string): number {
  const position = html.indexOf(value);
  expect(position).toBeGreaterThanOrEqual(0);
  return position;
}

describe("T010 InlineWorldBlock", () => {
  it("keeps loading and open in the same fixed outer frame", () => {
    const onCollapse = () => undefined;
    const loading = renderToStaticMarkup(
      createElement(InlineWorldBlock, { state: "loading", onCollapse }),
    );
    const open = renderToStaticMarkup(
      createElement(InlineWorldBlock, {
        state: "open",
        presentation: committedWorldPresentationFixture(),
        onCollapse,
        onReturnToSource: () => undefined,
        returnActionTestId: "evidence-return-market",
        returnSourceId: "smith.b1.c3.market_extent",
      }),
    );

    const expectedHeight = `--inline-world-frame-height:${INLINE_WORLD_FRAME_HEIGHT_PX}px`;
    expect(loading).toContain('data-world-state="loading"');
    expect(loading).toContain('data-state="loading"');
    expect(loading).toContain('data-testid="world-action-surface"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain(expectedHeight);
    expect(open).toContain('data-world-state="open"');
    expect(open).toContain('data-state="open"');
    expect(open).toContain('data-world-revision="1"');
    expect(open).toContain('aria-busy="false"');
    expect(open).toContain(expectedHeight);
  });

  it("keeps engineering metadata out of the default world surface", () => {
    const html = renderToStaticMarkup(
      createElement(InlineWorldBlock, {
        state: "open",
        presentation: committedWorldPresentationFixture(),
        onCollapse: () => undefined,
        onReturnToSource: () => undefined,
        returnActionTestId: "evidence-return-market",
        returnSourceId: "smith.b1.c3.market_extent",
      }),
    );
    const detailsStart = positionOf(html, "<details");
    const defaultWorld = html.slice(0, detailsStart);

    expect(positionOf(html, 'data-testid="world-actor-merchant"')).toBeLessThan(
      positionOf(html, 'data-testid="world-actor-shepherd"'),
    );
    expect(positionOf(html, 'data-testid="world-actor-shepherd"')).toBeLessThan(
      positionOf(html, 'data-testid="world-actor-spinner"'),
    );
    expect(positionOf(html, 'data-testid="world-actor-spinner"')).toBeLessThan(
      positionOf(html, 'data-testid="world-actor-weaver"'),
    );
    expect(html).toContain('data-testid="world-event-feed"');
    expect(html).toContain('data-event-sequence="0"');
    expect(html).toContain('data-actor-id="merchant"');
    expect(html).toContain('merchant:ship:orders_open');
    expect(html).toContain('data-testid="world-metric-supply"');
    expect(html).toContain('data-metric-key="supply"');
    expect(html).toContain('data-metric-value="17"');
    expect(html).toContain('data-testid="world-metric-cash"');
    expect(html).toContain('data-testid="world-collapse"');
    expect(html).not.toContain('data-testid="world-model-extension"');
    expect(html).not.toContain("MODEL EXTENSION");
    expect(html).toContain('data-testid="evidence-world-revision">1</dd>');
    expect(html).toContain(
      'data-testid="evidence-ruleset-id"><code>wool-town-v1</code>',
    );
    expect(html).toContain('data-testid="evidence-seed"><code>42</code>');
    expect(positionOf(html, 'data-testid="evidence-runtime"')).toBeGreaterThan(
      detailsStart,
    );
    expect(defaultWorld).not.toContain("世界修订");
    expect(defaultWorld).not.toContain("character_observation");
    expect(defaultWorld).not.toContain("wool-town-v1");
    expect(defaultWorld).not.toContain("seed");
  });

  it("does not introduce a second approval, preview or fullscreen surface", () => {
    const html = renderToStaticMarkup(
      createElement(InlineWorldBlock, {
        state: "open",
        presentation: committedWorldPresentationFixture(),
        onCollapse: () => undefined,
      }),
    );

    for (const forbidden of ["查看世界", "审批", "预览", "全屏", "KPI", "<svg"]) {
      expect(html).not.toContain(forbidden);
    }
  });
});
