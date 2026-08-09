/*
 * The Living Reader · Agent OS MVP
 *
 * This file deliberately has no DOM, network, clock, model, or browser APIs.
 * It is a deterministic fixture adapter: the public functions are the seam at
 * which a schema-constrained provider can be introduced later.  The browser
 * app consumes the same functions as the contract tests.
 */

const BOOK_REVISION = "smith-cannan-1904-vol1";
const RULESET_VERSION = "agent-os-mvp-v1";
const GRAPH_ID = "graph-division-market";
const WORLD_ID = "wool-town-mvp";

const SOURCE_BLOCKS = Object.freeze({
  division: Object.freeze({
    key: "division",
    source_id: "smith.b1.c1.division",
    book_revision: BOOK_REVISION,
    chapter: "BOOK I · CH. I",
    locator: Object.freeze({ page_display: "PDF 36" }),
    // This is the sentence visible on PDF 36 (Book I, Ch. I), preserved as a
    // verbatim source boundary for the QUOTE card.
    original_text: "THE greatest improvement in the productive powers of labour, and the greater part of the skill, dexterity, and judgment with which it is any where directed, or applied, seem to have been the effects of the division of labour.",
    translation_or_gloss: "分工让人在单一道工序上更熟练，减少来回切换。",
    content_hash: "sha256:division-mvp-anchor",
    evidence_refs: Object.freeze(["pdf:36", "smith.b1.c1.division"]),
    boundary: "primary_text",
  }),
  market: Object.freeze({
    key: "market",
    source_id: "smith.b1.c3.market_extent",
    book_revision: BOOK_REVISION,
    chapter: "BOOK I · CH. III",
    locator: Object.freeze({ page_display: "PDF 45" }),
    // This is the sentence visible on PDF 45 (Book I, Ch. III), preserved as
    // a verbatim source boundary for the QUOTE card.
    original_text: "AS it is the power of exchanging that gives occasion to the division of labour, so the extent of this division must always be limited by the extent of that power, or, in other words, by the extent of the market.",
    translation_or_gloss: "市场能触达的订单，限制了专业化还能继续多深。",
    content_hash: "sha256:market-mvp-anchor",
    evidence_refs: Object.freeze(["pdf:45", "smith.b1.c3.market_extent"]),
    boundary: "primary_text",
  }),
});

const ALLOWLIST = Object.freeze({
  deepen_specialization: Object.freeze({
    action_id: "deepen_specialization",
    ui_id: "specialize",
    label: "让织工进一步专业化",
    aliases: Object.freeze(["让织工进一步专业化", "让织工再专业化", "织工再细分", "进一步专业化"]),
    precondition: "world.playable && weaver.specialization_depth matches graph revision",
    reversible: true,
  }),
  expand_market: Object.freeze({
    action_id: "expand_market",
    ui_id: "expand",
    label: "扩大市场",
    aliases: Object.freeze(["扩大市场", "修路，把货卖到隔壁城", "修路把货卖到隔壁城", "扩大市场范围"]),
    precondition: "world.playable && expected world revision matches",
    reversible: true,
  }),
  constrain_market: Object.freeze({
    action_id: "constrain_market",
    ui_id: "constrain",
    label: "缩小市场范围",
    aliases: Object.freeze(["缩小市场", "缩小市场范围", "减少市场范围"]),
    precondition: "world.playable && expected world revision matches",
    reversible: true,
  }),
});

const ROLE_ORDER = Object.freeze(["merchant", "shepherd", "spinner", "weaver"]);

function textOf(input) {
  if (typeof input === "string") return input.trim();
  if (input && typeof input.text === "string") return input.text.trim();
  if (input && typeof input.transcript === "string") return input.transcript.trim();
  return "";
}

function normalizeText(input) {
  return textOf(input).toLowerCase().replace(/[\u3000\s]+/g, " ").trim();
}

function stableId(prefix, text, suffix = "") {
  const value = `${prefix}:${text}:${suffix}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function sourceIdsFor(input, activeSourceIds = []) {
  const requested = Array.isArray(activeSourceIds) ? activeSourceIds : [];
  // A source must be explicitly active.  Mentioning “分工” in free text is
  // not permission to bind a new Idea or answer to the nearest PDF page.
  if (!requested.length) return [];
  const valid = requested.filter((id) => Object.values(SOURCE_BLOCKS).some((source) => source.source_id === id || source.key === id));
  // An active-source snapshot is an authority boundary.  If any entry is
  // unknown, do not let an explicit “两段/比较” phrase manufacture a pair of
  // sources around it.
  if (valid.length !== requested.length) return [];
  const text = normalizeText(input);
  const explicitCrossSource = /两段|两页|分别|对比|比较|有什么关系|pdf\s*36.{0,18}45|36.{0,18}45/.test(text);
  if (!explicitCrossSource) return [...new Set(valid)];
  const ids = [SOURCE_BLOCKS.division.source_id, SOURCE_BLOCKS.market.source_id];
  if (/市场|订单|隔壁城|交换|卖不掉|运输/.test(text)) ids.push(SOURCE_BLOCKS.market.source_id);
  if (/分工|熟练|工序|专业化|织工|切换/.test(text)) ids.push(SOURCE_BLOCKS.division.source_id);
  if (valid.length) ids.push(...valid);
  return [...new Set(ids)].length ? [...new Set(ids)] : valid;
}

function hasExplicitStop(text) {
  return /^(?:先)?停(?:一下|止)?$|先停一下|停止(?:输入|播报|说话)?|不用(?:了)?|不想继续|不要(?:了)?|退出/.test(text);
}

function hasSourceQuestion(text) {
  return /吗[？?]?$|么[？?]?$|是不是|是否|为什么|怎么理解|这段(?:说|讲)|原文(?:是否|有没有|支持)|有什么关系|会让.*熟练|熟练.*吗/.test(text);
}

function actionCandidate(text) {
  if (/扩大市场|扩大市场范围|修路.{0,12}隔壁城|货.{0,10}隔壁城|卖到隔壁城|expand[_ ]?market/.test(text)) return "expand_market";
  if (/让织工.{0,8}(进一步|再)?专业化|织工.{0,8}(进一步|再)?细分|进一步专业化|deepen[_ ]?specialization/.test(text)) return "deepen_specialization";
  if (/缩小市场|减少市场范围|constrain[_ ]?market/.test(text)) return "constrain_market";
  return undefined;
}

function classifyInput(input, context = {}) {
  const raw = textOf(input);
  const text = normalizeText(raw);
  const requestedSources = input?.active_source_ids || input?.activeSourceIds || context.active_source_ids || context.activeSourceIds || [];
  const activeSourceIds = sourceIdsFor(input, requestedSources);
  const sourceUnavailable = requestedSources.length === 0 && !activeSourceIds.length;
  const explicitControl = input?.explicit_control || context.explicit_control || context.explicitControl || "none";
  const inputOrigin = input?.origin || context.input_origin || context.inputOrigin || "text";
  const knownAsrConfidence = typeof input?.asr_confidence === "number" && Number.isFinite(input.asr_confidence) && input.asr_confidence > 0;
  const lowConfidence = inputOrigin === "voice"
    ? (!knownAsrConfidence || input.asr_confidence < 0.62)
    : (input?.asr_confidence != null && (!knownAsrConfidence || input.asr_confidence < 0.62));
  const base = {
    classification_status: "classified",
    relevance: "unknown",
    confidence: lowConfidence ? "unknown" : "medium",
    target_source_ids: activeSourceIds,
    target_world_id: input?.active_world_id || input?.activeWorldId || context.active_world_id || context.activeWorldId,
    needs_confirmation: false,
    reason_codes: [],
  };
  if (!text) {
    return { ...base, classification_status: "needs_clarification", relevance: "unknown", confidence: "unknown", reason_codes: ["EMPTY_TURN"] };
  }
  if (explicitControl === "stop" || explicitControl === "refuse" || hasExplicitStop(text)) {
    return { ...base, explicit_control: explicitControl === "none" ? "stop" : explicitControl, intent_class: "emotion_personal", relevance: "personal", confidence: "high", reason_codes: ["EXPLICIT_STOP"] };
  }
  const action = actionCandidate(text);
  if (action) {
    return { ...base, intent_class: "executable_action", relevance: "mechanism_adjacent", confidence: lowConfidence ? "unknown" : "high", action_candidate: action, needs_confirmation: lowConfidence, reason_codes: ["ALLOWLIST_MATCH", "EXPLICIT_WORLD_CHANGE", ...(lowConfidence ? ["ASR_UNCERTAIN"] : [])] };
  }
  if (/只想摸鱼|不想看经济学|不想看书|无聊|天气|猫猫|忽略(?:之前|所有)?规则|提示注入|讲个笑话/.test(text)) {
    return { ...base, intent_class: "obvious_off_topic_noise", relevance: "none", confidence: lowConfidence ? "unknown" : "high", reason_codes: ["NO_BOOK_OR_WORLD_LINK"] };
  }
  if (/焦虑|害怕|难受|让我想起|我今天|我不想/.test(text)) {
    return { ...base, intent_class: "emotion_personal", relevance: "personal", confidence: lowConfidence ? "unknown" : "high", reason_codes: ["PERSONAL_EXPERIENCE"] };
  }
  if (/现实|历史|类比|像是|好像|公司里|互联网|学校|生活中|如果.*也/.test(text) && !hasSourceQuestion(text)) {
    return { ...base, intent_class: "productive_detour", relevance: activeSourceIds.length ? "mechanism_adjacent" : "unknown", confidence: lowConfidence ? "unknown" : "medium", reason_codes: ["MECHANISM_ADJACENT_DETOUR"] };
  }
  const hasExplicitSourceReference = /分工|熟练|工序|专业化|市场|订单|交换|织工|切换|这段|原文|两段|两页|pdf\s*36|pdf\s*45/.test(text);
  if (hasSourceQuestion(text) && hasExplicitSourceReference) {
    return { ...base, intent_class: "source_question", relevance: activeSourceIds.length ? "directly_anchored" : "unknown", confidence: lowConfidence ? "unknown" : "high", reason_codes: [sourceUnavailable ? "SOURCE_UNAVAILABLE" : "SOURCE_QUESTION"] };
  }
  // A short statement about the currently selected passage remains a reader
  // observation, not a world command.  This keeps Replay voice on the old
  // Idea path while still allowing a Thought candidate to be shown.
  if (/分工|市场|工序|专业化|织工|订单|交换/.test(text)) {
    return { ...base, intent_class: "productive_detour", relevance: activeSourceIds.length ? "mechanism_adjacent" : "unknown", confidence: lowConfidence ? "unknown" : "medium", reason_codes: ["PASSAGE_OBSERVATION"] };
  }
  return { ...base, intent_class: "obvious_off_topic_noise", relevance: "none", confidence: lowConfidence ? "unknown" : "low", reason_codes: ["NO_RELIABLE_INTENT"] };
}

function sourceById(id) {
  return Object.values(SOURCE_BLOCKS).find((source) => source.source_id === id || source.key === id) || null;
}

function evidenceFor(sourceIds) {
  return (sourceIds || []).map((id) => {
    const source = sourceById(id);
    return source ? {
      source_id: source.source_id,
      book_revision: source.book_revision,
      locator: source.locator,
      evidence_refs: source.evidence_refs,
      boundary: source.boundary,
    } : null;
  }).filter(Boolean);
}

function thoughtHash(text) {
  return stableId("text", String(text || ""));
}

function makeBookThought({ text, kind = "inference", sourceIds = [], confidence = "medium", openQuestion = null, status = "proposed", now = "2026-08-08T00:00:00.000Z", basisGraphRevision = 1 }) {
  const thoughtId = stableId("thought", text, sourceIds.join(","));
  return {
    thought_id: thoughtId,
    revision: 1,
    text: String(text || "").trim(),
    kind,
    source_ids: [...sourceIds],
    evidence: evidenceFor(sourceIds),
    confidence,
    open_question: openQuestion,
    revision_history: [{ revision: 1, text_hash: thoughtHash(text), changed_by: "agent", reason: "initial deterministic fixture proposal", changed_at: now }],
    status,
    basis_graph_revision: basisGraphRevision,
  };
}

function reviseBookThought(thought, nextText, { changedBy = "reader", reason = "reader revision", now = "2026-08-08T00:00:00.000Z", status = "visible" } = {}) {
  if (!thought || typeof thought !== "object") return null;
  const text = String(nextText || "").trim();
  if (!text) return { ...thought };
  const nextRevision = Number(thought.revision || 1) + 1;
  const history = Array.isArray(thought.revision_history) ? thought.revision_history.slice() : [];
  history.push({ revision: nextRevision, text_hash: thoughtHash(text), changed_by: changedBy, reason, changed_at: now, supersedes: Number(thought.revision || 1) });
  return { ...thought, revision: nextRevision, text, status, revision_history: history };
}

function sourceDiscussion(input, context = {}) {
  const ids = sourceIdsFor(input, context.active_source_ids || context.activeSourceIds || []);
  // This pure seam must never invent a source.  The browser route performs the
  // same guard, but callers may use sourceDiscussion directly in tests or a
  // future adapter, so an empty active-source snapshot is a hard stop.
  if (!ids.length) {
    return {
      type: "source_unavailable",
      answer: "先选择 PDF 36 或 PDF 45，才能把回答绑定到同一段原文。",
      quote: null,
      inference: null,
      thought: undefined,
      source_ids: [],
      evidence: [],
      confidence: "unknown",
      open_question: null,
      adapter: "deterministic-fixture",
      next_moves: ["选择来源"],
      domain_mutation: false,
    };
  }
  const sourceIds = ids;
  const text = textOf(input);
  const answer = /市场|订单|隔壁城/.test(normalizeText(text))
    ? "是有限度的：市场越能触达交换，专门做一道工序的人越容易把产出换出去；市场太小时，继续细分会失去交换对象。"
    : "在这两段原文的范围内，可以说分工让人反复做同一道工序，因而更熟练、少一些切换；但“市场足够大”是它能否继续细分的条件。";
  const activeIds = context.active_source_ids || context.activeSourceIds || [];
  const quoteSource = sourceById(activeIds[0]) || sourceById(sourceIds[0]) || SOURCE_BLOCKS.division;
  const quote = {
    kind: "quote",
    text: quoteSource.original_text,
    source_ids: [quoteSource.source_id],
    evidence: evidenceFor([quoteSource.source_id]),
    confidence: "high",
    boundary: "原文锚点（quote）",
  };
  const thought = makeBookThought({
    text: answer,
    kind: "inference",
    sourceIds: sourceIds,
    confidence: sourceIds.length > 1 ? "medium" : "high",
    openQuestion: "这两段没有给出一个精确的订单阈值；阈值属于可重放的模型扩展。",
    status: "visible",
    now: context.now || "2026-08-08T00:00:00.000Z",
    basisGraphRevision: context.graph_revision || context.graphRevision || 1,
  });
  return {
    type: "source_discussion",
    answer,
    quote,
    inference: thought,
    thought,
    source_ids: sourceIds,
    evidence: evidenceFor(sourceIds),
    confidence: thought.confidence,
    open_question: thought.open_question,
    adapter: "deterministic-fixture",
    next_moves: ["修订这条 BookThought", "接受", "拒绝"],
  };
}

function softReturn(input, context = {}) {
  const activeSourceIds = context.active_source_ids || context.activeSourceIds || [];
  const declined = Boolean(context.soft_return_declined || context.softReturnDeclined || context.paused);
  const normalized = normalizeText(input);
  const reason = /摸鱼|不想看经济学|不想看书/.test(normalized) ? "你今天想先摸鱼，这很正常。" : "这句话暂时没有和当前段落建立可靠连接。";
  const tension = context.world
    ? "当前织工正面对一个具体张力：小市场可能没有足够订单支撑下一层专业化。"
    : activeSourceIds.length
      ? "如果你愿意，当前市场范围段落正好把“谁来买走这道工序”摆在眼前。"
      : "先选择 PDF 36 或 PDF 45；我不会替你猜一个来源。";
  if (declined) {
    return {
      type: "soft_return",
      offered: false,
      declined: true,
      text: "好的，先停在这里。阅读状态不会被改动。",
      lines: ["好的，先停在这里。", "阅读状态不会被改动。"],
      next_moves: ["继续入口"],
      source_ids: [],
      domain_mutation: false,
    };
  }
  return {
    type: "soft_return",
    offered: true,
    declined: false,
    text: `${reason} ${tension}`,
    lines: [reason, tension, "要不要只看织工在小市场下的选择？"],
    next_moves: ["看织工的选择"],
    source_ids: activeSourceIds.length ? [activeSourceIds[0]] : [],
    domain_mutation: false,
  };
}

function validateWorldIdentity(world, context = {}, { requireExpectedRevision = true } = {}) {
  if (!world || typeof world !== "object") return { ok: false, code: "WORLD_NOT_READY", reason: "缺少 active world。" };
  const activeWorldId = context.active_world_id || context.activeWorldId;
  if (!activeWorldId || activeWorldId !== world.world_id) return { ok: false, code: "WORLD_IDENTITY_MISMATCH", reason: "active_world_id 与目标世界不匹配。" };
  if (!world.phase || !["running", "evidence_ready"].includes(world.phase)) return { ok: false, code: "WORLD_NOT_READY", reason: "世界尚未通过关系确认和 Playability Gate。" };
  if (!world.graph_id || world.graph_revision == null) return { ok: false, code: "GRAPH_IDENTITY_MISSING", reason: "世界缺少 graph_id 或 graph_revision。" };
  if (!context.graph_id || context.graph_id !== world.graph_id) return { ok: false, code: "GRAPH_IDENTITY_MISMATCH", reason: "graph_id 与目标世界不匹配。" };
  if (context.graph_revision == null) return { ok: false, code: "GRAPH_REVISION_REQUIRED", reason: "必须提供 graph_revision。" };
  if (Number(context.graph_revision) !== Number(world.graph_revision)) return { ok: false, code: "GRAPH_VERSION_MISMATCH", reason: "关系图版本已变化，这条动作需要重新审阅。" };
  if (requireExpectedRevision && context.expected_world_revision == null) return { ok: false, code: "EXPECTED_VERSION_REQUIRED", reason: "必须提供 expected_world_revision。" };
  if (requireExpectedRevision && Number(context.expected_world_revision) !== Number(world.revision)) return { ok: false, code: "EXPECTED_VERSION_MISMATCH", reason: "世界版本已变化，这条动作预览需要重新确认。" };
  return { ok: true };
}

function interpretAction(input, context = {}) {
  const text = normalizeText(input);
  const decision = classifyInput({ origin: input?.origin || context.input_origin || context.inputOrigin || "text", text: textOf(input), asr_confidence: input?.asr_confidence, active_source_ids: input?.active_source_ids || input?.activeSourceIds || context.active_source_ids || context.activeSourceIds, active_world_id: input?.active_world_id || input?.activeWorldId || context.active_world_id || context.activeWorldId }, context);
  const candidate = decision.action_candidate || actionCandidate(text);
  if (!candidate || !ALLOWLIST[candidate]) {
    return { ok: false, code: "ACTION_UNSUPPORTED", action_id: null, reason: "这句话没有匹配到 Agent OS 的世界动作 allowlist。", allowlist: Object.keys(ALLOWLIST) };
  }
  const identity = validateWorldIdentity(context.world, context);
  if (!identity.ok) return { ok: false, code: identity.code, action_id: candidate, action: ALLOWLIST[candidate], reason: identity.reason };
  if (decision.confidence === "unknown" || decision.needs_confirmation) {
    return { ok: false, code: "ASR_UNCERTAIN", action_id: candidate, action: ALLOWLIST[candidate], reason: "语音转写置信度不足；先编辑转写或明确确认，不能直接改变世界。", needs_confirmation: true };
  }
  const action = ALLOWLIST[candidate];
  const world = context.world;
  if (context.playable === false) return { ok: false, code: "WORLD_NOT_READY", action_id: candidate, action, reason: "世界尚未通过关系确认和 Playability Gate。" };
  return {
    ok: true,
    code: "ALLOWLIST_MATCH",
    action_id: candidate,
    ui_id: action.ui_id,
    action,
    target_world_id: world?.world_id || context.active_world_id || WORLD_ID,
    expected_world_revision: world?.revision,
    graph_revision: world?.graph_revision || context.graph_revision || 1,
    needs_confirmation: false,
    reversible: action.reversible,
    explanation: `将对 ${world?.world_id || WORLD_ID} 执行“${action.label}”；数值只由确定性 Kernel 演进。`,
  };
}

function emptyActor(role, patch = {}) {
  return {
    role,
    local_inventory: { raw_wool: 0, yarn: 0, cloth: 0 },
    inputs_available: 0,
    outputs_pending: 0,
    local_orders: 0,
    capacity: 4,
    specialization_depth: 1,
    minimum_orders_for_next_depth: 3,
    utilization: 0,
    stance: "waiting",
    ...patch,
  };
}

function createInitialWorld({ seed = "living-reader-mvp", graphRevision = 1, phase = "seeded", worldId = WORLD_ID } = {}) {
  const world = {
    world_id: worldId,
    revision: 0,
    graph_id: GRAPH_ID,
    graph_revision: graphRevision,
    seed,
    ruleset_version: RULESET_VERSION,
    phase,
    playable: phase === "running" || phase === "evidence_ready",
    market: { size: 1, reachable_orders: 2, demand: 8, transport_cost: 4, exchange_open: false },
    production: { output: 12, specialization_depth: 1, switching_loss: 4 },
    inventory: { raw_wool: 6, yarn: 2, cloth: 8 },
    orders: { open: 10, fulfilled: 0, backlog: 0 },
    cash: 24,
    actors: {
      shepherd: emptyActor("shepherd", { local_inventory: { raw_wool: 6, yarn: 0, cloth: 0 }, outputs_pending: 2, capacity: 6, utilization: 0.5, stance: "ready" }),
      spinner: emptyActor("spinner", { local_inventory: { raw_wool: 0, yarn: 2, cloth: 0 }, inputs_available: 0, outputs_pending: 1, capacity: 4, utilization: 0.5, stance: "waiting" }),
      weaver: emptyActor("weaver", { local_inventory: { raw_wool: 0, yarn: 2, cloth: 8 }, inputs_available: 2, outputs_pending: 1, capacity: 4, specialization_depth: 1, minimum_orders_for_next_depth: 4, local_orders: 2, utilization: 0.5, stance: "ready" }),
      merchant: emptyActor("merchant", { local_inventory: { raw_wool: 0, yarn: 0, cloth: 3 }, local_orders: 10, capacity: 3, utilization: 0.5, stance: "waiting" }),
    },
    event_ids: [],
    // These four mirrors are intentionally kept for the existing prototype
    // metric widgets.  The nested fields above remain the domain authority.
    output: 12,
    stock: 8,
    orders_metric: 2,
    market_label: "小市场",
  };
  return world;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function legacyMirror(world) {
  return {
    output: world.production.output,
    stock: world.inventory.cloth,
    orders: world.orders.open,
    cash: world.cash,
    market: world.market.size > 1 ? "扩大市场" : "小市场",
  };
}

function numericSnapshot(world) {
  return {
    revision: world.revision,
    market: clone(world.market),
    production: clone(world.production),
    inventory: clone(world.inventory),
    orders: clone(world.orders),
    cash: world.cash,
    actors: Object.fromEntries(Object.entries(world.actors).map(([role, actor]) => [role, {
      local_inventory: clone(actor.local_inventory),
      inputs_available: actor.inputs_available,
      outputs_pending: actor.outputs_pending,
      local_orders: actor.local_orders,
      capacity: actor.capacity,
      specialization_depth: actor.specialization_depth,
      utilization: actor.utilization,
    }])),
  };
}

function makeEvent(world, { kind, actionId, sequence, before, after, delta, message, characterId = null }) {
  const id = `world-event-${String(world.event_ids.length + 1).padStart(3, "0")}`;
  return { event_id: id, id, kind, action_id: actionId, sequence, character_id: characterId, world_id: world.world_id, world_revision: world.revision, before, after, delta, message, deterministic: true, ruleset_version: world.ruleset_version };
}

function observation(world, event, characterId, action, speech, visibleEffect, predicate) {
  const actor = world.actors[characterId];
  return {
    observation_id: `${event.event_id}:${characterId}`,
    world_id: world.world_id,
    world_revision: world.revision,
    character_id: characterId,
    trigger: { event_ids: [event.event_id], predicate },
    local_state: clone(actor),
    action,
    speech,
    speech_basis: [{ source_id: SOURCE_BLOCKS.market.source_id, event_id: event.event_id, ruleset_version: world.ruleset_version }],
    visible_effect: visibleEffect,
    deterministic: true,
  };
}

function refusalObservation(world, event) {
  const actor = world.actors.weaver;
  const threshold = actor.minimum_orders_for_next_depth + actor.outputs_pending;
  return observation(
    world,
    event,
    "weaver",
    "refuse",
    `现在只有 ${world.market.reachable_orders} 个可触达订单，不足以让我只做下一道工序（至少需要 ${threshold} 个）。`,
    "织工保持原专业化深度；订单、库存、产出和现金均未改变。",
    `market.reachable_orders < weaver.minimum_orders_for_next_depth + weaver.outputs_pending (${world.market.reachable_orders} < ${threshold})`,
  );
}

function evolveWorld(inputWorld, actionId, options = {}) {
  const original = clone(inputWorld || createInitialWorld());
  const world = clone(inputWorld || createInitialWorld());
  const action = ALLOWLIST[actionId] || Object.values(ALLOWLIST).find((entry) => entry.ui_id === actionId);
  const canonicalId = action?.action_id;
  if (!action) return { ok: false, code: "ACTION_UNSUPPORTED", world: original, nextWorld: original, events: [], observations: [], numeric_changed: false, reason: "动作不在 allowlist。" };
  const identity = validateWorldIdentity(world, {
    active_world_id: options.activeWorldId || options.active_world_id,
    graph_id: options.graphId || options.graph_id,
    graph_revision: options.graphRevision ?? options.graph_revision,
    expected_world_revision: options.expectedWorldRevision ?? options.expected_world_revision,
  });
  if (!identity.ok || options.playable === false) {
    const code = options.playable === false ? "WORLD_NOT_READY" : identity.code;
    const reason = options.playable === false ? "世界未打开。" : identity.reason;
    return { ok: false, code, world: original, nextWorld: original, events: [], observations: [], numeric_changed: false, reason };
  }
  const beforeNumeric = numericSnapshot(world);
  const events = [];
  const observations = [];

  if (canonicalId === "deepen_specialization") {
    const weaver = world.actors.weaver;
    const threshold = weaver.minimum_orders_for_next_depth + weaver.outputs_pending;
    if (world.market.reachable_orders < threshold) {
      const before = numericSnapshot(world);
      world.revision += 1;
      const after = numericSnapshot(world);
      const event = makeEvent(world, {
        kind: "character_refusal",
        actionId: canonicalId,
        sequence: 1,
        before,
        after,
        delta: { market: {}, production: {}, inventory: {}, orders: {}, cash: 0 },
        message: "小市场下织工拒绝进一步专业化；确定性内核保留原数值。",
        characterId: "weaver",
      });
      world.event_ids.push(event.event_id);
      events.push(event);
      observations.push(refusalObservation(world, event));
      world.phase = "running";
      return { ok: true, code: "CHARACTER_REFUSAL", action_id: canonicalId, world: original, nextWorld: world, events, observations, numeric_changed: false, reason: "baseline predicate 不满足。", legacy: legacyMirror(world) };
    }
    const before = numericSnapshot(world);
    world.production.specialization_depth += 1;
    world.production.output += 3;
    world.production.switching_loss = Math.max(0, world.production.switching_loss - 2);
    world.actors.weaver.specialization_depth += 1;
    world.actors.weaver.stance = "working";
    world.inventory.cloth += 2;
    world.orders.open = Math.max(0, world.orders.open - 1);
    world.orders.fulfilled += 1;
    world.cash += 2;
    world.revision += 1;
    const after = numericSnapshot(world);
    const event = makeEvent(world, { kind: "specialization_deepened", actionId: canonicalId, sequence: 1, before, after, delta: { output: 3, cloth: 2, cash: 2, switching_loss: -2 }, message: "订单足够，织工接受下一层专业化并织出更多粗呢。", characterId: "weaver" });
    world.event_ids.push(event.event_id);
    events.push(event);
    observations.push(observation(world, event, "weaver", "weave", "订单足够了，我可以只做这一道工序。", "织工专业化深度 +1，粗呢产出 +2。", `market.reachable_orders >= weaver.minimum_orders_for_next_depth + weaver.outputs_pending (${world.market.reachable_orders} >= ${threshold})`));
  } else if (canonicalId === "expand_market") {
    // Every number below is an explicit model extension.  No free text can
    // write these fields; all four role observations derive from this reducer.
    const beforeMarket = numericSnapshot(world);
    world.market.size = 2;
    world.market.reachable_orders = 8;
    world.market.demand = 12;
    world.market.transport_cost = 2;
    world.market.exchange_open = true;
    world.orders.open += 5;
    world.orders.backlog = Math.max(0, world.orders.backlog - 1);
    world.cash -= 1;
    world.revision += 1;
    const marketEvent = makeEvent(world, { kind: "market_expanded", actionId: canonicalId, sequence: 1, before: beforeMarket, after: numericSnapshot(world), delta: { market_size: 1, reachable_orders: 6, demand: 4, transport_cost: -2, open_orders: 5, cash: -1 }, message: "修路打开隔壁城的交换路径；订单变得可触达。", characterId: "merchant" });
    world.event_ids.push(marketEvent.event_id);
    events.push(marketEvent);
    world.actors.merchant.local_orders = world.orders.open;
    world.actors.merchant.stance = "shipping";
    world.actors.merchant.utilization = 0.9;
    observations.push(observation(world, marketEvent, "merchant", "ship", "隔壁城的订单现在能走进账本；运输成本降到 2。", "商人先打开可触达订单并开始发货。", "market.exchange_open === true && market.reachable_orders > 0"));

    const shepherdBefore = numericSnapshot(world);
    world.actors.shepherd.local_inventory.raw_wool += 2;
    world.inventory.raw_wool += 2;
    world.actors.shepherd.outputs_pending = Math.max(0, world.actors.shepherd.outputs_pending - 1);
    world.actors.shepherd.stance = "working";
    world.revision += 1;
    const shepherdEvent = makeEvent(world, { kind: "wool_gathered", actionId: canonicalId, sequence: 2, before: shepherdBefore, after: numericSnapshot(world), delta: { raw_wool: 2 }, message: "订单增加，牧羊人把羊毛送入交换链。", characterId: "shepherd" });
    world.event_ids.push(shepherdEvent.event_id);
    events.push(shepherdEvent);
    observations.push(observation(world, shepherdEvent, "shepherd", "gather", "我把两捆羊毛送到交换链，纺纱工现在有输入了。", "raw_wool +2，输入可用。", "shepherd.local_inventory.raw_wool > 0"));

    const spinnerBefore = numericSnapshot(world);
    world.actors.spinner.inputs_available += 2;
    world.actors.spinner.local_inventory.yarn += 2;
    world.inventory.yarn += 2;
    world.actors.spinner.outputs_pending = Math.max(0, world.actors.spinner.outputs_pending - 1);
    world.actors.spinner.stance = "working";
    world.actors.spinner.utilization = 0.8;
    world.revision += 1;
    const spinnerEvent = makeEvent(world, { kind: "yarn_spun", actionId: canonicalId, sequence: 3, before: spinnerBefore, after: numericSnapshot(world), delta: { yarn: 2 }, message: "纺纱工接到羊毛，补上纱线输入。", characterId: "spinner" });
    world.event_ids.push(spinnerEvent.event_id);
    events.push(spinnerEvent);
    observations.push(observation(world, spinnerEvent, "spinner", "spin", "有羊毛和订单，我把它纺成纱线交给织工。", "yarn +2，等待状态解除。", "spinner.inputs_available > 0 && spinner.local_orders <= spinner.capacity"));

    const weaverBefore = numericSnapshot(world);
    const weaver = world.actors.weaver;
    weaver.inputs_available += 2;
    weaver.local_orders = Math.min(world.market.reachable_orders, 5);
    const threshold = weaver.minimum_orders_for_next_depth + weaver.outputs_pending;
    let weaverAction = "hold";
    let weaverSpeech = `订单仍不足以继续细分（${world.market.reachable_orders} < ${threshold}），我先保持原工序。`;
    let weaverEffect = "织工保持原专业化深度。";
    if (world.market.reachable_orders >= threshold) {
      weaverAction = "accept";
      weaver.stance = "working";
      weaver.specialization_depth += 1;
      world.production.specialization_depth += 1;
      world.production.output += 5;
      world.production.switching_loss = Math.max(0, world.production.switching_loss - 2);
      world.inventory.cloth += 3;
      world.orders.fulfilled += 3;
      world.orders.open = Math.max(0, world.orders.open - 3);
      world.cash += 5;
      weaverSpeech = "订单够多了，我接受下一层专业化，专心把纱线织成粗呢。";
      weaverEffect = "织工专业化深度 +1，粗呢产出 +5。";
    }
    world.revision += 1;
    const weaverEvent = makeEvent(world, { kind: weaverAction === "accept" ? "weaver_specialized" : "weaver_waited", actionId: canonicalId, sequence: 4, before: weaverBefore, after: numericSnapshot(world), delta: { output: world.production.output - weaverBefore.production.output, cloth: world.inventory.cloth - weaverBefore.inventory.cloth, orders_fulfilled: world.orders.fulfilled - weaverBefore.orders.fulfilled, cash: world.cash - weaverBefore.cash }, message: weaverAction === "accept" ? "订单达到门槛，织工接受下一层专业化。" : "市场虽扩大，当前订单仍不足；织工诚实保持原工序。", characterId: "weaver" });
    world.event_ids.push(weaverEvent.event_id);
    events.push(weaverEvent);
    observations.push(observation(world, weaverEvent, "weaver", weaverAction, weaverSpeech, weaverEffect, `market.reachable_orders >= weaver.minimum_orders_for_next_depth + weaver.outputs_pending (${world.market.reachable_orders} >= ${threshold})`));
    world.phase = "evidence_ready";
  } else if (canonicalId === "constrain_market") {
    const before = numericSnapshot(world);
    world.market.size = 1;
    world.market.reachable_orders = 1;
    world.market.demand = 5;
    world.market.transport_cost = 5;
    world.market.exchange_open = false;
    world.orders.backlog += 3;
    world.orders.open = Math.max(0, world.orders.open - 4);
    world.production.switching_loss += 2;
    world.cash = Math.max(0, world.cash - 3);
    world.actors.merchant.stance = "hold";
    world.actors.merchant.local_orders = world.orders.open;
    world.revision += 1;
    const event = makeEvent(world, { kind: "market_constrained", actionId: canonicalId, sequence: 1, before, after: numericSnapshot(world), delta: { reachable_orders: -7, backlog: 3, switching_loss: 2, cash: -3 }, message: "市场收窄，交换路径关闭，订单积压重新出现。", characterId: "merchant" });
    world.event_ids.push(event.event_id);
    events.push(event);
    observations.push(observation(world, event, "merchant", "hold", "可触达订单太少，运输成本太高，我先不发货。", "商人保持等待，积压 +3。", "market.exchange_open === false || market.reachable_orders === 0"));
  }
  const afterNumeric = numericSnapshot(world);
  const numericChanged = JSON.stringify(beforeNumeric) !== JSON.stringify(afterNumeric);
  return { ok: true, code: "WORLD_EVENT_RECORDED", action_id: canonicalId, world: original, nextWorld: world, events, observations, numeric_changed: numericChanged, legacy: legacyMirror(world) };
}

function roleObservations(world, actionId, options = {}) {
  const result = evolveWorld(world, actionId, {
    ...options,
    playable: options.playable !== false,
    activeWorldId: options.activeWorldId || world?.world_id,
    graphId: options.graphId || world?.graph_id,
    graphRevision: options.graphRevision ?? world?.graph_revision,
    expectedWorldRevision: options.expectedWorldRevision ?? world?.revision,
  });
  return result.observations;
}

function routeAgentInput(input, context = {}) {
  const decision = classifyInput(input, context);
  const text = textOf(input);
  const routeContext = {
    ...context,
    active_source_ids: input?.active_source_ids || input?.activeSourceIds || context.active_source_ids || context.activeSourceIds,
    active_world_id: input?.active_world_id || input?.activeWorldId || context.active_world_id || context.activeWorldId,
  };
  if (!text) return { decision, type: "clarification", response: { type: "clarification", text: "没有听清，可以重说或继续阅读。", next_moves: ["重说"] }, domain_mutation: false };
  if (decision.explicit_control === "stop" || decision.explicit_control === "refuse") return { decision, type: "interrupted", response: { type: "interrupted", text: "好的，已停止这一轮输入和播报。", next_moves: ["继续入口"] }, domain_mutation: false };
  if (decision.intent_class === "source_question") {
    if (!decision.target_source_ids.length && !((input?.active_source_ids || input?.activeSourceIds || context.active_source_ids || context.activeSourceIds || []).length)) return { decision: { ...decision, classification_status: "needs_clarification" }, type: "source_unavailable", response: { type: "source_unavailable", text: "先选择 PDF 36 或 PDF 45，才能把回答绑定到同一段原文。", next_moves: ["选择来源"] }, domain_mutation: false };
    const response = sourceDiscussion(input, routeContext);
    if (response.type === "source_unavailable") return { decision: { ...decision, classification_status: "needs_clarification", reason_codes: [...(decision.reason_codes || []), "SOURCE_UNAVAILABLE"] }, type: "source_unavailable", response, domain_mutation: false };
    return { decision, type: "source_discussion", response, thought: response.thought, domain_mutation: false };
  }
  if (decision.intent_class === "executable_action") {
    const action = interpretAction(input, routeContext);
    return { decision, type: action.ok ? "world_action" : "action_failed", action, response: action.ok ? { type: "action_preview", text: action.explanation, next_moves: ["执行"] } : { type: "action_failed", text: action.reason, next_moves: ["修正动作"] }, domain_mutation: false };
  }
  if (decision.intent_class === "productive_detour") {
    const thought = makeBookThought({ text: `这个联想可以作为机制实验：${text}`, kind: "experiment", sourceIds: decision.target_source_ids, confidence: decision.confidence, openQuestion: "它是否改变了市场可触达订单或专业化门槛？", status: "proposed", now: context.now || "2026-08-08T00:00:00.000Z", basisGraphRevision: context.graph_revision || 1 });
    return { decision, type: "productive_detour", response: { type: "productive_detour", text: "这个联想有用：它可以检验“市场范围是否支撑专业化”这个变量。要不要把它留作一次可运行实验？", next_moves: ["保存为实验"], source_ids: decision.target_source_ids }, thought, domain_mutation: false };
  }
  if (decision.intent_class === "emotion_personal") {
    return { decision, type: "emotion_personal", response: { type: "emotion_personal", text: "听起来你现在更需要一点空间，不必把个人感受变成阅读任务。", next_moves: ["继续入口"], source_ids: [], domain_mutation: false }, domain_mutation: false };
  }
  const response = softReturn(input, routeContext);
  return { decision, type: "soft_return", response, domain_mutation: false };
}

// Short aliases keep the test and browser seams discoverable without hiding
// the contract names.
const route = routeAgentInput;
const routeInput = routeAgentInput;
const interpret = interpretAction;
const answerSourceQuestion = sourceDiscussion;
const discussSource = sourceDiscussion;
const answerSource = sourceDiscussion;
const softReturnResponse = softReturn;
const reduceWorld = evolveWorld;
const applyWorldAction = evolveWorld;
const reduceWorldState = evolveWorld;
const observeRoles = roleObservations;
const getSourceBlock = sourceById;

const api = {
  BOOK_REVISION,
  RULESET_VERSION,
  GRAPH_ID,
  WORLD_ID,
  SOURCE_BLOCKS,
  ALLOWLIST,
  ROLE_ORDER,
  classifyInput,
  interpretAction,
  routeAgentInput,
  route,
  routeInput,
  interpret,
  sourceDiscussion,
  discussSource,
  answerSource,
  answerSourceQuestion,
  softReturn,
  softReturnResponse,
  makeBookThought,
  reviseBookThought,
  createInitialWorld,
  evolveWorld,
  reduceWorld,
  applyWorldAction,
  reduceWorldState,
  roleObservations,
  observeRoles,
  getSourceBlock,
  legacyMirror,
};

if (typeof globalThis !== "undefined") globalThis.LivingReaderAgentOS = api;
if (typeof module !== "undefined" && module.exports) {
  // Individual assignments make named imports work from node:test while the
  // same file remains a browser-loadable classic script.
  exports.BOOK_REVISION = BOOK_REVISION;
  exports.RULESET_VERSION = RULESET_VERSION;
  exports.GRAPH_ID = GRAPH_ID;
  exports.WORLD_ID = WORLD_ID;
  exports.SOURCE_BLOCKS = SOURCE_BLOCKS;
  exports.ALLOWLIST = ALLOWLIST;
  exports.ROLE_ORDER = ROLE_ORDER;
  exports.classifyInput = classifyInput;
  exports.interpretAction = interpretAction;
  exports.routeAgentInput = routeAgentInput;
  exports.route = route;
  exports.routeInput = routeInput;
  exports.interpret = interpret;
  exports.sourceDiscussion = sourceDiscussion;
  exports.discussSource = discussSource;
  exports.answerSource = answerSource;
  exports.answerSourceQuestion = answerSourceQuestion;
  exports.softReturn = softReturn;
  exports.softReturnResponse = softReturnResponse;
  exports.makeBookThought = makeBookThought;
  exports.reviseBookThought = reviseBookThought;
  exports.createInitialWorld = createInitialWorld;
  exports.evolveWorld = evolveWorld;
  exports.reduceWorld = reduceWorld;
  exports.applyWorldAction = applyWorldAction;
  exports.reduceWorldState = reduceWorldState;
  exports.roleObservations = roleObservations;
  exports.observeRoles = observeRoles;
  exports.getSourceBlock = getSourceBlock;
  exports.legacyMirror = legacyMirror;
}
