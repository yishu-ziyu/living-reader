import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ChapterReadingShell,
  type ChapterReadingShellProps,
} from "@/components/reading/ChapterReadingShell";

function fixtureProps(): ChapterReadingShellProps {
  return {
    chapter: {
      bookId: "wealth-of-nations",
      bookTitle: "国富论",
      author: "亚当·斯密",
      editionLabel: "Cannan 1904",
      bookPartId: "smith.b1",
      bookPartLabel: "第一篇",
      chapterId: "smith.b1.c1",
      chapterLabel: "第一章",
      chapterTitle: "论劳动分工",
      sourceBlocks: [
        {
          sourceId: "smith.b1.c1.p1",
          locator: "Smith_0206-01_235",
          contentHash: "a".repeat(64),
          originalText: "The greatest improvements in the productive powers of labour...",
          evidenceLabel: "Cannan 英文原文",
        },
      ],
    },
    toc: {
      books: ["I", "II", "III", "IV", "V"].map((roman, index) => ({
        id: `smith.b${index + 1}`,
        label: `Book ${roman}`,
        title: `第${index + 1}篇`,
        chapters: [
          {
            id: `smith.b${index + 1}.c1`,
            label: "第一章",
            title: index === 0 ? "论劳动分工" : `第${index + 1}篇第一章`,
            href: `/read/wealth-of-nations/smith.b${index + 1}.c1`,
          },
        ],
      })),
    },
    translation: {
      locale: "zh-CN",
      entries: {
        "smith.b1.c1.p1": {
          text: "劳动生产力上最大的改进，似乎都是分工的结果……",
          reviewStatus: "machine",
        },
      },
    },
    providerSourceEvidence: {},
    providerDiscussionSnapshots: {},
    providerVoiceSnapshots: {},
    memories: [
      {
        id: "memory-reader",
        kind: "discussion_theme",
        origin: "reader_confirmed",
        text: "继续追问分工如何改变熟练度",
        sourceId: "smith.b1.c1.p1",
      },
      {
        id: "memory-agent",
        kind: "confusion",
        origin: "agent_observed",
        text: "也许仍在区分产量与生产率",
        sourceId: "smith.b1.c1.p1",
      },
    ],
    resumeSourceId: "smith.b1.c1.p1",
    onResume: vi.fn(),
    onRetire: vi.fn(),
  };
}

describe("ChapterReadingShell", () => {
  it("renders a Chinese-first continuous chapter with honest source and memory identities", () => {
    const html = renderToStaticMarkup(
      createElement(ChapterReadingShell, fixtureProps()),
    );

    expect(html).toContain("劳动生产力上最大的改进");
    expect(html).toContain("机译");
    expect(html).toContain("显示原文对照");
    expect(html).toContain("Cannan 英文原文");
    expect(html).toContain("data-source-id=\"smith.b1.c1.p1\"");
    expect(html).toContain("data-reading-origin=\"translation\"");
    expect(html).toContain("data-reading-origin=\"original\"");
    expect(html).toContain("hidden=\"\"");

    for (const roman of ["I", "II", "III", "IV", "V"]) {
      expect(html).toContain(`Book ${roman}`);
    }

    expect(html).toContain("读者确认");
    expect(html).toContain("Agent 观察");
    expect(html).toContain("继续上次阅读");
    expect(html).not.toContain("<svg");
  });
});
