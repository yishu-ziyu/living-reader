import { expect, test, type Page } from "@playwright/test";

const CHAPTER_PATH = "/read/wealth-of-nations/smith.b1.c1";
const EXPERIENCE_ID = "exp_live_reader";
const SECOND_SOURCE_ID = "smith.b1.c1.p2";

type BridgeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string } };

type EventStoreBridge = {
  ready?: boolean;
  load: (experienceId: string) => Promise<BridgeResult<unknown[]>>;
};

type BridgeWindow = Window & {
  __T003_EVENT_STORE__?: EventStoreBridge;
};

type MemoryEvent = {
  protocol_version: string;
  message_id: string;
  message_name:
    | "reader_world.memory.noted.v1"
    | "reader_world.memory.retired.v1";
  hlc: { physical_ms: number; logical: number };
  device_id: string;
  payload: {
    memory_id: string;
    source_locator?: string | null;
    origin?: "reader_confirmed" | "agent_observed";
  };
};

function isMemoryEvent(value: unknown): value is MemoryEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  const payload = event.payload;
  const hlc = event.hlc;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  if (!hlc || typeof hlc !== "object" || Array.isArray(hlc)) return false;
  const memoryPayload = payload as Record<string, unknown>;
  const clock = hlc as Record<string, unknown>;
  return (
    event.protocol_version === "reader-world-protocol/v2" &&
    typeof event.message_id === "string" &&
    (event.message_name === "reader_world.memory.noted.v1" ||
      event.message_name === "reader_world.memory.retired.v1") &&
    typeof event.device_id === "string" &&
    typeof clock.physical_ms === "number" &&
    typeof clock.logical === "number" &&
    typeof memoryPayload.memory_id === "string"
  );
}

async function waitForEventStore(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const bridgeWindow = window as BridgeWindow;
      const bridge = bridgeWindow.__T003_EVENT_STORE__;
      return bridge?.ready === true;
    },
    { timeout: 30_000 },
  );
}

async function loadMemoryEvents(page: Page): Promise<MemoryEvent[]> {
  const loaded = await page.evaluate(async (experienceId) => {
    const bridgeWindow = window as BridgeWindow;
    const bridge = bridgeWindow.__T003_EVENT_STORE__;
    if (!bridge) throw new Error("EventStore bridge is unavailable");
    return bridge.load(experienceId);
  }, EXPERIENCE_ID);
  if (!loaded.ok) {
    throw new Error(`Unable to load memory events: ${loaded.error.code}`);
  }
  return loaded.value.filter(isMemoryEvent);
}

test("chapter memory resumes after reload and retires append-only", async ({
  page,
}) => {
  await page.goto(CHAPTER_PATH);
  await expect(page.getByTestId("chapter-reading-shell")).toBeVisible();
  await waitForEventStore(page);

  await page.getByTestId("chapter-source-block-2").evaluate((element) => {
    element.scrollIntoView({ block: "start" });
  });
  await expect
    .poll(async () => (await loadMemoryEvents(page)).length)
    .toBe(1);

  const beforeReload = await loadMemoryEvents(page);
  const deviceId = beforeReload[0]!.device_id;
  expect(deviceId).toMatch(/^device_[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  expect(beforeReload[0]).toMatchObject({
    protocol_version: "reader-world-protocol/v2",
    message_name: "reader_world.memory.noted.v1",
    device_id: deviceId,
    payload: {
      source_locator: SECOND_SOURCE_ID,
      origin: "reader_confirmed",
    },
  });
  expect(beforeReload[0]!.message_id).toMatch(
    /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/,
  );

  await page.reload();
  await expect(page.getByTestId("chapter-reading-shell")).toBeVisible();
  await waitForEventStore(page);
  await expect(page.getByTestId("resume-reading-entry")).toBeVisible();
  const afterReload = await loadMemoryEvents(page);
  expect(afterReload[0]).toMatchObject({
    message_id: beforeReload[0]!.message_id,
    hlc: beforeReload[0]!.hlc,
    device_id: deviceId,
  });

  await page.getByRole("button", { name: "记忆 1" }).click();
  const memoryPanel = page.getByRole("dialog", { name: "阅读记忆" });
  await expect(memoryPanel.getByText("读者确认", { exact: true })).toBeVisible();
  await expect(memoryPanel.getByText("阅读位置", { exact: true })).toBeVisible();
  await expect(memoryPanel.getByText(SECOND_SOURCE_ID, { exact: true })).toBeVisible();
  await memoryPanel.getByRole("button", { name: "删除" }).click();
  await expect(memoryPanel.getByText("这条记忆已删除。", { exact: true })).toBeVisible();
  await expect(
    memoryPanel.getByText("还没有可见记忆。Agent 不会把推断伪装成你的想法。"),
  ).toBeVisible();
  await expect(page.getByTestId("resume-reading-entry")).toHaveCount(0);
  await expect
    .poll(async () => (await loadMemoryEvents(page)).length)
    .toBe(2);

  const afterRetire = await loadMemoryEvents(page);
  expect(afterRetire[0]).toEqual(beforeReload[0]);
  expect(afterRetire[1]).toMatchObject({
    protocol_version: "reader-world-protocol/v2",
    message_name: "reader_world.memory.retired.v1",
    device_id: deviceId,
    payload: { memory_id: beforeReload[0]!.payload.memory_id },
  });
  expect(afterRetire[1]!.message_id).toMatch(
    /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/,
  );
});

test("root resumes the latest saved chapter instead of restarting the book", async ({
  page,
}) => {
  const chapterThree = "/read/wealth-of-nations/smith.b1.c3";
  const chapterThreeSource = "smith.b1.c3.p2";
  await page.goto(chapterThree);
  await expect(page.getByTestId("chapter-reading-shell")).toBeVisible();
  await waitForEventStore(page);

  await page.getByTestId("chapter-source-block-2").evaluate((element) => {
    element.scrollIntoView({ block: "start" });
  });
  await expect
    .poll(async () =>
      (await loadMemoryEvents(page)).some(
        (event) => event.payload.source_locator === chapterThreeSource,
      ),
    )
    .toBe(true);

  await page.goto("/");
  await expect(page).toHaveURL(
    /\/read\/wealth-of-nations\/smith\.b1\.c3$/u,
  );
  await expect(page.getByTestId("resume-reading-entry")).toBeVisible();
});
