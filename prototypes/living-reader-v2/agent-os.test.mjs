import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALLOWLIST,
  ROLE_ORDER,
  SOURCE_BLOCKS,
  classifyInput,
  createInitialWorld,
  evolveWorld,
  interpretAction,
  reviseBookThought,
  routeAgentInput,
  sourceDiscussion,
  softReturn,
} from "./agent-os.js";

const sources = {
  division: "smith.b1.c1.division",
  market: "smith.b1.c3.market_extent",
};

function worldContext(world, extra = {}) {
  return {
    world,
    playable: true,
    active_world_id: world.world_id,
    graph_id: world.graph_id,
    graph_revision: world.graph_revision,
    expected_world_revision: world.revision,
    ...extra,
  };
}

const PDF_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../assets/public-domain/wealth-of-nations-cannan-vol1.pdf");

function normalizedPdfPage(page) {
  if (!existsSync(PDF_PATH)) return null;
  const result = spawnSync("pdftotext", ["-raw", "-f", String(page), "-l", String(page), PDF_PATH, "-"], { encoding: "utf8" });
  if (result.error || result.status !== 0) return null;
  // PDF footnote markers are attached to words in pdftotext raw output
  // (improvement2, labour1), but are not part of the primary sentence.
  return String(result.stdout || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/([a-z])\d+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function countPhrase(haystack, needle) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = haystack.indexOf(needle, offset);
    if (index === -1) return count;
    count += 1;
    offset = index + needle.length;
  }
}

test("classifies the five intent families with deterministic fixtures", () => {
  assert.equal(classifyInput("分工会让人更熟练吗？", { active_source_ids: [sources.division] }).intent_class, "source_question");
  assert.equal(classifyInput("让织工进一步专业化", { active_source_ids: [sources.market], active_world_id: "wool-town-mvp" }).intent_class, "executable_action");
  assert.equal(classifyInput("这像我在公司里看到的流水线", { active_source_ids: [sources.division] }).intent_class, "productive_detour");
  assert.equal(classifyInput("我有点焦虑，不想继续", { active_source_ids: [sources.market] }).intent_class, "emotion_personal");
  assert.equal(classifyInput("我今天只想摸鱼，不想看经济学", { active_source_ids: [sources.market] }).intent_class, "obvious_off_topic_noise");
  assert.deepEqual(classifyInput("两段有什么关系？", { active_source_ids: [sources.division] }).target_source_ids.sort(), [sources.division, sources.market].sort());
  assert.deepEqual(classifyInput("两段有什么关系？", { active_source_ids: ["unknown.source"] }).target_source_ids, []);
  assert.deepEqual(classifyInput("市场范围会限制专业化吗？", { active_source_ids: [sources.market] }).target_source_ids, [sources.market]);
});

test("source discussion keeps quote and inference boundaries and a revision history", () => {
  const response = sourceDiscussion("分工会让人更熟练吗？", { active_source_ids: [sources.division], now: "2026-08-08T10:00:00.000Z" });
  assert.equal(response.quote.kind, "quote");
  assert.equal(response.quote.source_ids[0], sources.division);
  assert.equal(response.inference.kind, "inference");
  assert.deepEqual(response.inference.source_ids, [sources.division]);
  assert.ok(response.inference.open_question);
  const revised = reviseBookThought(response.thought, "我暂时接受熟练度的解释，但还不确定市场阈值。", { now: "2026-08-08T10:01:00.000Z" });
  assert.equal(revised.revision, 2);
  assert.equal(revised.revision_history.length, 2);
  assert.equal(revised.revision_history[1].changed_by, "reader");
  const marketResponse = sourceDiscussion("市场范围限制专业化吗？", { active_source_ids: [sources.market] });
  assert.equal(marketResponse.quote.source_ids[0], sources.market);
  assert.equal(marketResponse.quote.text, SOURCE_BLOCKS.market.original_text);
});

test("unknown active source fails closed even for explicit cross-source wording", () => {
  const decision = classifyInput("两段有什么关系？", { active_source_ids: ["unknown.source"] });
  assert.deepEqual(decision.target_source_ids, []);
  const routed = routeAgentInput("两段有什么关系？", { active_source_ids: ["unknown.source"] });
  assert.equal(routed.type, "source_unavailable");
  assert.equal(routed.domain_mutation, false);
});

test("QUOTE boundaries match their corresponding PDF pages", { skip: !existsSync(PDF_PATH) }, () => {
  const divisionPage = normalizedPdfPage(36);
  const marketPage = normalizedPdfPage(45);
  if (divisionPage === null || marketPage === null) return;
  const divisionQuote = SOURCE_BLOCKS?.division?.original_text;
  const marketQuote = SOURCE_BLOCKS?.market?.original_text;
  assert.equal(countPhrase(divisionPage, divisionQuote.toLowerCase()), 1);
  assert.equal(countPhrase(marketPage, marketQuote.toLowerCase()), 1);
});

test("no active source fails closed instead of binding to a mentioned page", () => {
  const decision = classifyInput("分工会让人更熟练吗？", { active_source_ids: [] });
  assert.deepEqual(decision.target_source_ids, []);
  const routed = routeAgentInput("分工会让人更熟练吗？", { active_source_ids: [] });
  assert.equal(routed.type, "source_unavailable");
  assert.equal(routed.domain_mutation, false);
  const weather = routeAgentInput("明天会下雨吗？", { active_source_ids: [sources.market] });
  assert.equal(weather.type, "soft_return");
  assert.equal(weather.decision.intent_class, "obvious_off_topic_noise");
  assert.equal(weather.thought, undefined);
  assert.deepEqual(weather.response.source_ids, [sources.market]);
  const noSourceSoftReturn = softReturn("明天会下雨吗？", { active_source_ids: [] });
  assert.deepEqual(noSourceSoftReturn.source_ids, []);
  const directNoSource = sourceDiscussion("分工会让人更熟练吗？", { active_source_ids: [] });
  assert.equal(directNoSource.type, "source_unavailable");
  assert.equal(directNoSource.quote, null);
  assert.deepEqual(directNoSource.source_ids, []);
});

test("world action interpretation is allowlist-only", () => {
  const world = createInitialWorld({ phase: "running" });
  assert.equal(interpretAction("修路，把货卖到隔壁城", worldContext(world)).action_id, "expand_market");
  assert.equal(interpretAction("直接把现金改成一百", worldContext(world)).ok, false);
  assert.deepEqual(Object.keys(ALLOWLIST).sort(), ["constrain_market", "deepen_specialization", "expand_market"]);
  assert.equal(interpretAction({ text: "扩大市场", asr_confidence: 0.3 }, worldContext(world)).code, "ASR_UNCERTAIN");
  assert.equal(interpretAction({ origin: "voice", text: "扩大市场" }, worldContext(world)).code, "ASR_UNCERTAIN");
  assert.equal(interpretAction({ origin: "text", text: "扩大市场" }, worldContext(world)).ok, true);
  assert.equal(interpretAction("扩大市场", { world, playable: true }).ok, false);
});

test("small-market deepen specialization refuses without numeric mutation", () => {
  const world = createInitialWorld({ phase: "running" });
  const result = evolveWorld(world, "deepen_specialization", {
    playable: true,
    activeWorldId: world.world_id,
    graphId: world.graph_id,
    graphRevision: world.graph_revision,
    expectedWorldRevision: world.revision,
  });
  assert.equal(result.code, "CHARACTER_REFUSAL");
  assert.equal(result.numeric_changed, false);
  assert.deepEqual(result.nextWorld.market, world.market);
  assert.deepEqual(result.nextWorld.production, world.production);
  assert.deepEqual(result.nextWorld.inventory, world.inventory);
  assert.deepEqual(result.nextWorld.orders, world.orders);
  assert.equal(result.nextWorld.cash, world.cash);
  assert.deepEqual(result.observations.map((item) => item.character_id), ["weaver"]);
  assert.equal(result.observations[0].action, "refuse");
});

test("expand market is deterministic and emits causal merchant-to-weaver observations", () => {
  const firstWorld = createInitialWorld({ phase: "running", seed: "test-seed" });
  const secondWorld = createInitialWorld({ phase: "running", seed: "test-seed" });
  const first = evolveWorld(firstWorld, "expand_market", { ...worldContext(firstWorld), activeWorldId: firstWorld.world_id, graphId: firstWorld.graph_id, graphRevision: firstWorld.graph_revision, expectedWorldRevision: firstWorld.revision });
  const second = evolveWorld(secondWorld, "expand_market", { ...worldContext(secondWorld), activeWorldId: secondWorld.world_id, graphId: secondWorld.graph_id, graphRevision: secondWorld.graph_revision, expectedWorldRevision: secondWorld.revision });
  assert.equal(first.code, "WORLD_EVENT_RECORDED");
  assert.deepEqual(first.observations.map((item) => item.character_id), ROLE_ORDER);
  assert.deepEqual(first.observations.map((item) => item.action), ["ship", "gather", "spin", "accept"]);
  assert.equal(first.nextWorld.market.exchange_open, true);
  assert.ok(first.nextWorld.market.reachable_orders > 2);
  assert.deepEqual(first.nextWorld, second.nextWorld);
  assert.deepEqual(first.events, second.events);
  assert.deepEqual(first.observations, second.observations);
});

test("off-topic soft return does not mutate domain state and refusal is not repeated", () => {
  const world = createInitialWorld({ phase: "running" });
  const first = routeAgentInput("我今天只想摸鱼，不想看经济学", { active_source_ids: [sources.market], world });
  assert.equal(first.type, "soft_return");
  assert.equal(first.response.offered, true);
  assert.equal(first.domain_mutation, false);
  assert.ok(!/回到书上|你偏题了/.test(first.response.text));
  const declined = softReturn("不用", { world, soft_return_declined: true });
  assert.equal(declined.offered, false);
  assert.equal(declined.declined, true);
  assert.deepEqual(declined.next_moves, ["继续入口"]);
  assert.equal(softReturn("明天会下雨吗？", { world, paused: true }).offered, false);
});

test("stop and unsupported world paths fail closed", () => {
  const stopped = routeAgentInput("先停一下", { active_source_ids: [sources.market] });
  assert.equal(stopped.type, "interrupted");
  const world = createInitialWorld({ phase: "seeded" });
  const notReady = interpretAction("扩大市场", { world, playable: false });
  assert.equal(notReady.ok, false);
  const staleWorld = { ...world, phase: "running", revision: 2 };
  const stale = interpretAction("扩大市场", { ...worldContext(staleWorld), expected_world_revision: 1 });
  assert.equal(stale.code, "EXPECTED_VERSION_MISMATCH");
  const identityWorld = createInitialWorld({ phase: "running" });
  const identityResult = evolveWorld(identityWorld, "expand_market", { playable: true });
  assert.equal(identityResult.code, "WORLD_IDENTITY_MISMATCH");
});
