import { expect, test } from "@playwright/test";

test.describe("T011 realtime voice UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const testWindow = window as typeof window & {
        __voiceGetUserMediaCalls: number;
      };
      testWindow.__voiceGetUserMediaCalls = 0;
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async () => {
          testWindow.__voiceGetUserMediaCalls += 1;
          throw new DOMException("Permission denied for test", "NotAllowedError");
        },
      });
    });
  });

  test("does not request microphone before click and switches the source anchor", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByTestId("realtime-voice-panel")).toBeVisible();
    await expect(page.getByTestId("voice-state")).toContainText("尚未开始");
    await expect(page.getByTestId("voice-source-snapshot")).toContainText(
      "PDF 36",
    );
    await expect(page.getByText("StepFun · Realtime")).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & { __voiceGetUserMediaCalls: number })
            .__voiceGetUserMediaCalls,
      ),
    ).toBe(0);

    await page.getByRole("button", { name: "PDF 45 · 市场" }).click();
    await expect(page.getByTestId("voice-source-snapshot")).toContainText(
      "PDF 45",
    );
    await expect(page.getByTestId("voice-state")).toContainText("尚未开始");
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & { __voiceGetUserMediaCalls: number })
            .__voiceGetUserMediaCalls,
      ),
    ).toBe(0);
  });

  test("permission denial stays visible and preserves the text fallback", async ({
    page,
  }) => {
    const voiceRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/voice/")) voiceRequests.push(request.url());
    });
    await page.goto("/");

    await page.getByTestId("voice-start").click();
    await expect(page.getByTestId("voice-state")).toContainText(
      "麦克风权限被拒绝",
    );
    await expect(page.getByRole("link", { name: "文字提问" })).toHaveAttribute(
      "href",
      "#idea-input-division",
    );
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & { __voiceGetUserMediaCalls: number })
            .__voiceGetUserMediaCalls,
      ),
    ).toBe(1);
    expect(voiceRequests).toEqual([]);
  });
});
