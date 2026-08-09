import { expect, test, type Page } from "@playwright/test";

type PermissionMode = "granted" | "denied" | "unsupported";

type AgentTurnRequest = {
  turn?: {
    turn_id?: unknown;
    channel?: unknown;
    final_text?: unknown;
    source_snapshot_id?: unknown;
    active_source_ids?: unknown;
  };
};

async function installAgentTurnMock(page: Page) {
  const requests: AgentTurnRequest[] = [];
  await page.route("**/api/agent-turn", async (route) => {
    const body = route.request().postDataJSON() as AgentTurnRequest;
    requests.push(body);
    const rawSourceId = Array.isArray(body.turn?.active_source_ids)
      ? body.turn.active_source_ids[0]
      : "";
    const sourceId =
      typeof rawSourceId === "string" ? rawSourceId : "unknown-source";
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        candidate: {
          mode: "discuss",
          intent_class: "source_question",
          relevance: "directly_anchored",
          confidence: "high",
          target_source_ids: [sourceId],
          evidence_refs: [],
          open_question: null,
          companion_line: "我接住这句了。",
          proposed_action_id: null,
          pending_action_id: null,
          reason_codes: ["test_voice_final"],
        },
      }),
    });
  });
  return requests;
}

async function installVoiceBrowserMock(
  page: Page,
  options: {
    permission: PermissionMode;
    session?: "ready" | "missing-key";
  },
) {
  await page.addInitScript(
    ({ permission, session }) => {
      const testWindow = window as typeof window & {
        __voiceGetUserMediaCalls: number;
        __voiceTrackStops: number;
        __voicePlaybackStops: number;
        __voiceRemoteDeletes: number;
        __voiceEventSourceClosed: number;
        __emitVoiceEvent: (event: unknown) => void;
        __voiceEventEmitters: Array<(event: unknown) => void>;
      };
      testWindow.__voiceGetUserMediaCalls = 0;
      testWindow.__voiceTrackStops = 0;
      testWindow.__voicePlaybackStops = 0;
      testWindow.__voiceRemoteDeletes = 0;
      testWindow.__voiceEventSourceClosed = 0;
      testWindow.__emitVoiceEvent = () => {};
      testWindow.__voiceEventEmitters = [];

      if (permission === "unsupported") {
        Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
          configurable: true,
          value: undefined,
        });
        return;
      }

      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async () => {
          testWindow.__voiceGetUserMediaCalls += 1;
          if (permission === "denied") {
            throw new DOMException(
              "Permission denied for test",
              "NotAllowedError",
            );
          }
          return {
            getTracks: () => [
              {
                stop: () => {
                  testWindow.__voiceTrackStops += 1;
                },
              },
            ],
          };
        },
      });

      class FakeAudioContext {
        state = "running";
        currentTime = 0;
        sampleRate = 48_000;
        destination = {};

        async resume() {}
        async close() {
          this.state = "closed";
        }
        createMediaStreamSource() {
          return { connect() {}, disconnect() {} };
        }
        createScriptProcessor() {
          return {
            onaudioprocess: null,
            connect() {},
            disconnect() {},
          };
        }
        createBuffer(_channels: number, length: number, sampleRate: number) {
          const data = new Float32Array(length);
          return {
            duration: length / sampleRate,
            getChannelData: () => data,
          };
        }
        createBufferSource() {
          return {
            buffer: null,
            onended: null as (() => void) | null,
            connect() {},
            start() {},
            stop() {
              testWindow.__voicePlaybackStops += 1;
              this.onended?.();
            },
          };
        }
      }
      Object.defineProperty(window, "AudioContext", {
        configurable: true,
        value: FakeAudioContext,
      });

      class FakeEventSource {
        static readonly CLOSED = 2;
        readyState = 1;
        onerror: (() => void) | null = null;
        private voiceListener: ((event: { data: string }) => void) | null = null;

        constructor() {
          const emit = (event: unknown) => {
            this.voiceListener?.({ data: JSON.stringify(event) });
          };
          testWindow.__voiceEventEmitters.push(emit);
          testWindow.__emitVoiceEvent = emit;
        }
        addEventListener(
          type: string,
          listener: (event: { data: string }) => void,
        ) {
          if (type === "voice") this.voiceListener = listener;
        }
        close() {
          this.readyState = FakeEventSource.CLOSED;
          testWindow.__voiceEventSourceClosed += 1;
        }
      }
      Object.defineProperty(window, "EventSource", {
        configurable: true,
        value: FakeEventSource,
      });

      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const rawUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const url = new URL(rawUrl, window.location.origin);
        if (!url.pathname.startsWith("/api/voice/session")) {
          return originalFetch(input, init);
        }

        const method = init?.method ?? "GET";
        if (url.pathname === "/api/voice/session" && method === "POST") {
          if (session === "missing-key") {
            return Response.json(
              {
                ok: false,
                error: {
                  code: "voice_not_configured",
                  message:
                    "服务端尚未配置 STEPFUN_API_KEY，可继续使用文字输入。",
                },
              },
              { status: 503 },
            );
          }
          return Response.json({ ok: true, session: { id: "voice-test-1" } });
        }
        if (method === "DELETE") {
          testWindow.__voiceRemoteDeletes += 1;
        }
        return Response.json({ ok: true });
      };
    },
    options,
  );
}

test.describe("T011/T024 realtime voice UI", () => {
  test("does not request microphone before click and switches the source anchor", async ({
    page,
  }) => {
    await installVoiceBrowserMock(page, { permission: "denied" });
    await page.goto("/test-harness");

    await expect(page.getByTestId("realtime-voice-panel")).toBeVisible();
    await expect(page.getByTestId("voice-state")).toContainText("尚未开始");
    await expect(page.getByTestId("voice-source-snapshot")).toContainText(
      "PDF 36",
    );
    await expect(page.getByText("StepFun · Realtime")).toBeVisible();
    expect(
      await page.evaluate(() =>
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
      await page.evaluate(() =>
        (window as typeof window & { __voiceGetUserMediaCalls: number })
          .__voiceGetUserMediaCalls,
      ),
    ).toBe(0);
  });

  test("permission denial stays visible and preserves the text fallback", async ({
    page,
  }, testInfo) => {
    await installVoiceBrowserMock(page, { permission: "denied" });
    await page.goto("/test-harness");

    await page.getByTestId("voice-start").click();
    await expect(page.getByTestId("voice-state")).toContainText(
      "麦克风权限被拒绝",
    );
    await expect(page.getByRole("link", { name: "文字提问" })).toHaveAttribute(
      "href",
      "#discussion-input-division",
    );
    expect(
      await page.evaluate(() =>
        (window as typeof window & { __voiceGetUserMediaCalls: number })
          .__voiceGetUserMediaCalls,
      ),
    ).toBe(1);
    await page.screenshot({
      path: testInfo.outputPath("a007-denied.png"),
      fullPage: true,
    });
  });

  test("unsupported browser preserves the text fallback", async ({
    page,
  }, testInfo) => {
    await installVoiceBrowserMock(page, { permission: "unsupported" });
    await page.goto("/test-harness");
    await page.getByTestId("voice-start").click();
    await expect(page.getByTestId("voice-state")).toContainText(
      "当前浏览器不支持",
    );
    await page.screenshot({
      path: testInfo.outputPath("a007-unsupported.png"),
      fullPage: true,
    });
  });

  test("Orb follows listening, thinking, speaking, cancel, and Stop", async ({
    page,
  }) => {
    await installVoiceBrowserMock(page, { permission: "granted" });
    await page.goto("/test-harness");

    const panel = page.getByTestId("realtime-voice-panel");
    await expect(panel).toHaveAttribute("data-voice-activity", "resting");
    await expect(page.getByTestId("voice-orb")).toHaveAttribute(
      "aria-label",
      "语音准备好了",
    );

    await page.getByTestId("voice-start").click();
    await expect(panel).toHaveAttribute("data-voice-activity", "listening");
    await expect(page.getByTestId("voice-activity-label")).toHaveText(
      "正在听你说",
    );

    await page.evaluate(() => {
      (
        window as typeof window & {
          __emitVoiceEvent: (event: unknown) => void;
        }
      ).__emitVoiceEvent({
        type: "reader.speech_stopped",
        itemId: "reader-orb-1",
      });
    });
    await expect(panel).toHaveAttribute("data-voice-activity", "thinking");
    await expect(page.getByTestId("voice-activity-label")).toHaveText(
      "正在理解",
    );

    await page.evaluate(() => {
      (
        window as typeof window & {
          __emitVoiceEvent: (event: unknown) => void;
        }
      ).__emitVoiceEvent({ type: "companion.audio_delta", audio: "AAA=" });
    });
    await expect(panel).toHaveAttribute("data-voice-activity", "speaking");
    await expect(page.getByTestId("voice-activity-label")).toHaveText(
      "陪读正在说",
    );

    await page.getByTestId("voice-cancel").click();
    await expect(panel).toHaveAttribute("data-voice-activity", "listening");
    await expect(page.getByTestId("voice-state")).toContainText(
      "已取消当前回复",
    );

    await page.getByTestId("voice-stop").click();
    await expect(panel).toHaveAttribute("data-voice-activity", "resting");
    await expect(page.getByTestId("voice-orb")).toHaveAttribute(
      "aria-label",
      "语音已停止",
    );
  });

  test("reduced motion is static and narrow controls stay reachable", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await installVoiceBrowserMock(page, { permission: "denied" });
    await page.goto("/test-harness");

    const panel = page.getByTestId("realtime-voice-panel");
    const sourceButton = page.getByRole("button", { name: "PDF 36 · 分工" });
    const startButton = page.getByTestId("voice-start");
    await expect(panel).toBeInViewport();
    await expect(sourceButton).toBeInViewport();
    await expect(startButton).toBeInViewport();
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    expect((await sourceButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect((await startButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);

    const orb = page.getByTestId("voice-orb");
    await page.waitForTimeout(150);
    const firstFrame = await orb.screenshot();
    await page.waitForTimeout(250);
    const secondFrame = await orb.screenshot();
    expect(secondFrame.equals(firstFrame)).toBe(true);
  });

  test("missing key releases the granted track and preserves text", async ({
    page,
  }, testInfo) => {
    await installVoiceBrowserMock(page, {
      permission: "granted",
      session: "missing-key",
    });
    await page.goto("/test-harness");
    await page.getByTestId("voice-start").click();
    await expect(page.getByTestId("voice-state")).toContainText(
      "服务端尚未配置 STEPFUN_API_KEY",
    );
    await expect(page.getByRole("link", { name: "文字提问" })).toBeVisible();
    expect(
      await page.evaluate(() =>
        (window as typeof window & { __voiceTrackStops: number })
          .__voiceTrackStops,
      ),
    ).toBe(1);
    await page.screenshot({
      path: testInfo.outputPath("a007-missing-key.png"),
      fullPage: true,
    });
  });

  test("final is exactly once on its start snapshot and Stop fences late events", async ({
    page,
  }, testInfo) => {
    await installVoiceBrowserMock(page, { permission: "granted" });
    const agentTurnRequests = await installAgentTurnMock(page);
    await page.goto("/test-harness");
    await page.getByTestId("voice-start").click();
    await expect(page.getByTestId("voice-state")).toContainText("正在聆听");

    await page.getByTestId("source-block-market").scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const testWindow = window as typeof window & {
        __emitVoiceEvent: (event: unknown) => void;
      };
      const finalEvent = {
        type: "reader.transcript_final",
        itemId: "reader-item-1",
        text: "开口时我还在分工段。",
      };
      testWindow.__emitVoiceEvent(finalEvent);
      testWindow.__emitVoiceEvent(finalEvent);
      testWindow.__emitVoiceEvent({
        type: "companion.audio_delta",
        audio: "AAA=",
      });
    });

    await expect(page.getByTestId("agent-turn-companion-line")).toHaveText(
      "我接住这句了。",
    );
    await expect(page.locator("[data-testid^='idea-card-']")).toHaveCount(0);
    expect(agentTurnRequests).toHaveLength(1);
    expect(agentTurnRequests[0]?.turn).toMatchObject({
      turn_id: "voice:voice-test-1:reader-item-1",
      channel: "voice",
      final_text: "开口时我还在分工段。",
      active_source_ids: ["smith.b1.c1.division"],
    });
    expect(agentTurnRequests[0]?.turn?.source_snapshot_id).toMatch(
      /^smith\.b1\.c1\.division:/,
    );

    await page.getByTestId("voice-stop").click();
    await expect(page.getByTestId("voice-state")).toContainText(
      "通话已停止，麦克风已释放",
    );
    expect(
      await page.evaluate(() => {
        const testWindow = window as typeof window & {
          __voiceTrackStops: number;
          __voicePlaybackStops: number;
          __voiceRemoteDeletes: number;
          __voiceEventSourceClosed: number;
        };
        return {
          tracks: testWindow.__voiceTrackStops,
          playback: testWindow.__voicePlaybackStops,
          remote: testWindow.__voiceRemoteDeletes,
          eventSource: testWindow.__voiceEventSourceClosed,
        };
      }),
    ).toEqual({ tracks: 1, playback: 1, remote: 1, eventSource: 1 });

    await page.evaluate(() => {
      (
        window as typeof window & {
          __emitVoiceEvent: (event: unknown) => void;
        }
      ).__emitVoiceEvent({
        type: "reader.transcript_final",
        itemId: "reader-item-after-stop",
        text: "这条不应该入账。",
      });
    });
    await expect(page.locator("[data-testid^='idea-card-']")).toHaveCount(0);
    expect(agentTurnRequests).toHaveLength(1);
    await page.screenshot({
      path: testInfo.outputPath("a007-granted-stop-a008-frozen-source.png"),
      fullPage: true,
    });
  });

  test("Stop invalidates an in-flight AgentTurn before its late result can publish", async ({
    page,
  }) => {
    await installVoiceBrowserMock(page, { permission: "granted" });
    let releaseResponse: () => void = () => {};
    let markRequestStarted: () => void = () => {};
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const requestStarted = new Promise<void>((resolve) => {
      markRequestStarted = resolve;
    });
    let requestCount = 0;
    await page.route("**/api/agent-turn", async (route) => {
      requestCount += 1;
      markRequestStarted();
      await responseGate;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          candidate: {
            mode: "discuss",
            intent_class: "source_question",
            relevance: "directly_anchored",
            confidence: "high",
            target_source_ids: ["smith.b1.c1.division"],
            evidence_refs: [],
            open_question: null,
            companion_line: "迟到结果不应出现",
            proposed_action_id: null,
            pending_action_id: null,
            reason_codes: ["test_late_after_stop"],
          },
        }),
      });
    });

    await page.goto("/test-harness");
    await page.getByTestId("voice-start").click();
    await expect(page.getByTestId("voice-state")).toContainText("正在聆听");
    await page.evaluate(() => {
      (
        window as typeof window & {
          __emitVoiceEvent: (event: unknown) => void;
        }
      ).__emitVoiceEvent({
        type: "reader.transcript_final",
        itemId: "reader-in-flight",
        text: "这一句还在处理。",
      });
    });
    await requestStarted;

    await page.getByTestId("voice-stop").click();
    await expect(page.getByTestId("voice-state")).toContainText(
      "通话已停止，麦克风已释放",
    );
    releaseResponse();

    await expect(page.getByTestId("voice-state")).toContainText(
      "通话已停止，麦克风已释放",
    );
    await expect(page.getByTestId("agent-turn-companion-line")).toHaveCount(0);
    expect(requestCount).toBe(1);
    await expect(page.locator("[data-testid^='idea-card-']")).toHaveCount(0);
  });

  test("an EventSource callback from a prior start cannot cross reconnect", async ({
    page,
  }) => {
    await installVoiceBrowserMock(page, { permission: "granted" });
    const agentTurnRequests = await installAgentTurnMock(page);
    await page.goto("/test-harness");

    await page.getByTestId("voice-start").click();
    await page.getByTestId("voice-stop").click();
    await page.getByTestId("voice-start").click();
    await expect(page.getByTestId("voice-state")).toContainText("正在聆听");

    await page.evaluate(() => {
      const testWindow = window as typeof window & {
        __voiceEventEmitters: Array<(event: unknown) => void>;
      };
      testWindow.__voiceEventEmitters[0]?.({
        type: "reader.transcript_final",
        itemId: "reader-stale-reconnect",
        text: "旧连接的迟到转写。",
      });
    });
    await page.waitForTimeout(150);
    expect(agentTurnRequests).toHaveLength(0);

    await page.getByTestId("voice-stop").click();
  });

  test("source switch drops a queued final from the prior anchor", async ({
    page,
  }) => {
    await installVoiceBrowserMock(page, { permission: "granted" });
    let requestCount = 0;
    let releaseResponse: () => void = () => {};
    let markRequestStarted: () => void = () => {};
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const requestStarted = new Promise<void>((resolve) => {
      markRequestStarted = resolve;
    });
    await page.route("**/api/agent-turn", async (route) => {
      requestCount += 1;
      markRequestStarted();
      await responseGate;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          candidate: {
            mode: "discuss",
            intent_class: "source_question",
            relevance: "directly_anchored",
            confidence: "high",
            target_source_ids: ["smith.b1.c1.division"],
            evidence_refs: [],
            open_question: null,
            companion_line: "第一句仍按开始时的分工段理解。",
            proposed_action_id: null,
            pending_action_id: null,
            reason_codes: ["test_source_switch"],
          },
        }),
      });
    });

    await page.goto("/test-harness");
    await page.getByTestId("voice-start").click();
    await expect(page.getByTestId("voice-state")).toContainText("正在聆听");
    await page.evaluate(() => {
      const emit = (
        window as typeof window & {
          __emitVoiceEvent: (event: unknown) => void;
        }
      ).__emitVoiceEvent;
      emit({
        type: "reader.transcript_final",
        itemId: "reader-switch-first",
        text: "第一句在分工段。",
      });
      emit({
        type: "reader.transcript_final",
        itemId: "reader-switch-queued",
        text: "第二句已经排队。",
      });
    });
    await requestStarted;

    await page.getByRole("button", { name: "PDF 45 · 市场" }).click();
    releaseResponse();

    await expect(page.getByTestId("voice-source-snapshot")).toContainText(
      "PDF 45",
    );
    await expect(page.getByTestId("agent-turn-companion-line")).toHaveText(
      "第一句仍按开始时的分工段理解。",
    );
    await page.waitForTimeout(200);
    expect(requestCount).toBe(1);
    await expect(page.locator("[data-testid^='idea-card-']")).toHaveCount(0);
  });

  test("Replay stops active voice before writing its fixture", async ({
    page,
  }, testInfo) => {
    await installVoiceBrowserMock(page, { permission: "granted" });
    await page.goto("/test-harness");
    await page.getByTestId("voice-start").click();
    await expect(page.getByTestId("voice-state")).toContainText("正在聆听");

    await page.getByTestId("market-replay-fixture").click();
    await expect(page.getByTestId("voice-state")).toContainText(
      "已停止活动录音并释放麦克风",
    );
    await expect(page.getByTestId("idea-card-idea_market_fixture")).toBeVisible();
    expect(
      await page.evaluate(() => {
        const testWindow = window as typeof window & {
          __voiceTrackStops: number;
          __voiceRemoteDeletes: number;
        };
        return {
          tracks: testWindow.__voiceTrackStops,
          remote: testWindow.__voiceRemoteDeletes,
        };
      }),
    ).toEqual({ tracks: 1, remote: 1 });
    await page.screenshot({
      path: testInfo.outputPath("a007-replay-after-stop.png"),
      fullPage: true,
    });
  });
});
