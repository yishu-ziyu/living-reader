const PDF_URL = "../../assets/public-domain/wealth-of-nations-cannan-vol1.pdf";
const PDFJS_URL = "./vendor/pdfjs/pdf.min.mjs";
const PDF_WORKER_URL = "./vendor/pdfjs/pdf.worker.min.mjs";
const SEGMENT_MANIFEST = {
  page: 45,
  cutYTopPt: 312.5,
  quote: "DIVISION OF LABOUR IS LIMITED BY THE EXTENT OF THE MARKET",
  quoteFragments: [
    "the extent of this division must always be limited by the extent of that power",
    "for want of the power to exchange all that surplus part of the produce",
  ],
  titleFragment: "that the division of labour is limited by the extent of the market",
  scale: 1.45,
};

const PAGE_MAP = {
  division: {
    key: "division",
    page: 36,
    chapter: "BOOK I · CH. I",
    label: "分工",
    short: "专业化 / 熟练与少切换",
  },
  market: {
    key: "market",
    page: 45,
    chapter: "BOOK I · CH. III",
    label: "市场范围",
    short: "谁来买走这道工序",
  },
};

const REPLAY_TEXT = {
  division: "我觉得分工会让每个人更熟练，也少一点来回切换；但我还不知道市场要多大。",
  market: "如果市场太小，专门做一道工序的人可能卖不掉自己的产出，最后还得兼做别的工作。",
};

const ART_CANDIDATES = {
  shepherd: ["./assets/art/characters/shepherd.png"],
  spinner: ["./assets/art/characters/spinner.png"],
  weaver: ["./assets/art/characters/weaver.png"],
  merchant: ["./assets/art/characters/merchant.png"],
};

// agent-os.js is a browser-safe deterministic fixture loaded immediately
// before this module.  Keeping the seam global avoids coupling the PDF
// compositor to any provider or DOM side effect.
const AgentOS = globalThis.LivingReaderAgentOS;
if (!AgentOS) throw new Error("Agent OS fixture failed to load");

// The visible MVP ledger uses the small-market opening fixture: two open
// orders and two reachable orders. Keep this adapter-local mirror explicit so
// the Gate never renders a legacy ten-order value before the first reducer
// event is recorded.
function createAppAgentWorld() {
  const world = AgentOS.createInitialWorld({ phase: "seeded" });
  world.orders.open = 2;
  if (world.actors?.merchant) world.actors.merchant.local_orders = 2;
  world.orders_metric = 2;
  return world;
}

const ACTIONS = {
  specialize: {
    title: "重排工序",
    event: "小市场仍在：四个人兼做多工序，切换损耗被记入账本。",
    delta: { output: 2, stock: -1, orders: 0, cash: -1 },
    market: "小市场",
  },
  expand: {
    title: "扩大市场后专业化",
    event: "市场扩大：shepherd → spinner → weaver → merchant，切换损耗下降。",
    delta: { output: 7, stock: 3, orders: 5, cash: 4 },
    market: "扩大市场",
  },
  constrain: {
    title: "缩小市场范围",
    event: "市场缩小：专业化链条出现积压，角色重新兼做多工序。",
    delta: { output: -3, stock: -2, orders: -4, cash: -3 },
    market: "小市场",
  },
};

const state = {
  variant: getVariantFromUrl(),
  activeTarget: "division",
  ideas: [],
  relationConnected: false,
  relationConfirmed: false,
  relation: {
    graph_id: "graph-division-market",
    graph_revision: 1,
    edge_id: "edge-specialization-market",
    from_node: "state_variable.specialization",
    to_node: "source_claim.market_extent",
    type: "constrains",
    source_ids: [],
    evidence_refs: ["pdf:36", "pdf:45"],
    status: "draft",
    stale: false,
    stale_reason: null,
  },
  playable: false,
  world: {
    output: 12,
    stock: 8,
    orders: 2,
    cash: 24,
    market: "等待关系",
    events: [],
    runCount: 0,
    collapsed: false,
  },
  agentOS: {
    world: createAppAgentWorld(),
    thoughts: [],
    responses: [],
    observations: [],
    events: [],
    lastRoute: null,
    softReturnDeclined: false,
    muted: false,
    speaking: false,
    speechText: "",
    adapter: "deterministic-fixture",
    paused: false,
    speechGeneration: 0,
  },
  voice: {
    recording: false,
    requesting: false,
    requestGeneration: 0,
    stream: null,
    recorder: null,
    recognition: null,
    chunks: [],
    transcript: "",
    transcriptFinal: false,
    finalConfidence: null,
    captureSource: null,
    captureGeneration: 0,
    committed: false,
  },
  pdf: {
    doc: null,
    pdfjs: null,
    loaded: false,
    anchorResolved: false,
    error: null,
    pageCache: new Map(),
    renderToken: 0,
  },
};

let ideaSequence = 0;

const dom = {
  body: document.body,
  pdfStatus: document.querySelector("#pdfStatus"),
  voiceButton: document.querySelector("#voiceButton"),
  voiceButtonLabel: document.querySelector("#voiceButton .voice-button__label"),
  replayButton: document.querySelector("#replayVoiceButton"),
  voiceStateLed: document.querySelector("#voiceStateLed"),
  voiceStatus: document.querySelector("#voiceStatus"),
  transcriptLive: document.querySelector("#transcriptLive"),
  textInput: document.querySelector("#textIdeaInput"),
  textSubmit: document.querySelector("#saveTextIdea"),
  activeLayoutLabel: document.querySelector("#activeLayoutLabel"),
  workspaceState: document.querySelector("#workspaceState"),
  workspaceOrb: document.querySelector("#workspaceOrb"),
  connectionBanner: document.querySelector("#connectionBanner"),
  connectionText: document.querySelector("#connectionText"),
  ideaList: document.querySelector("#ideaList"),
  ideaProgress: document.querySelector("#ideaProgress"),
  relationCard: document.querySelector("#relationCard"),
  confirmRelation: document.querySelector("#confirmRelation"),
  playabilityGate: document.querySelector("#playabilityGate"),
  gateTitle: document.querySelector("#gateTitle"),
  gateCopy: document.querySelector("#gateCopy"),
  readyButton: document.querySelector("#readyButton"),
  outcomePanel: document.querySelector("#outcomePanel"),
  outcomeDivision: document.querySelector("#outcomeIdeaDivision"),
  outcomeMarket: document.querySelector("#outcomeIdeaMarket"),
  outcomeResult: document.querySelector("#outcomeResult"),
  outcomeEvents: document.querySelector("#outcomeEvents"),
  returnToReading: document.querySelector("#returnToReading"),
  ledgerIdeas: document.querySelector("#ledgerIdeas"),
  ledgerRelation: document.querySelector("#ledgerRelation"),
  ledgerWorld: document.querySelector("#ledgerWorld"),
  anchorCount: document.querySelector("#anchorCount"),
  sessionClock: document.querySelector("#sessionClock"),
  surface: document.querySelector("#readerSurface"),
  agentOsLed: document.querySelector("#agentOsLed"),
  agentOsResponse: document.querySelector("#agentOsResponse"),
  agentOsThoughts: document.querySelector("#agentOsThoughts"),
  agentOsSpeak: document.querySelector("#agentOsSpeak"),
  agentOsMute: document.querySelector("#agentOsMute"),
  agentOsStopOutput: document.querySelector("#agentOsStopOutput"),
  agentOsContinue: document.querySelector("#agentOsContinue"),
  agentOsSoftReturn: document.querySelector("#agentOsSoftReturn"),
};

const pdfCanvasSpecs = [
  { id: "aPage10", page: "division", kind: "full" },
  { id: "aPage12", page: "market", kind: "full" },
  { id: "bPage45Top", page: "market", kind: "top" },
  { id: "bPage45Bottom", page: "market", kind: "bottom" },
  { id: "bPage36", page: "division", kind: "full" },
  { id: "cPage10", page: "division", kind: "full" },
  { id: "cPage12", page: "market", kind: "full" },
];

const worldSlots = ["worldSlotA", "worldSlotB", "worldSlotC"]
  .map((id) => document.getElementById(id))
  .filter(Boolean);
const worldBlocks = [];

function getVariantFromUrl() {
  const value = new URLSearchParams(window.location.search).get("variant");
  return ["A", "B", "C"].includes(String(value).toUpperCase()) ? String(value).toUpperCase() : "B";
}

function pageInfo(key) {
  return PAGE_MAP[key] || PAGE_MAP.division;
}

function setText(selector, text) {
  document.querySelectorAll(selector).forEach((node) => {
    node.textContent = text;
  });
}

function sourceIdForTarget(target = state.activeTarget) {
  return target === "market" ? "smith.b1.c3.market_extent" : "smith.b1.c1.division";
}

function sourceTargetForId(sourceId) {
  return sourceId === "smith.b1.c3.market_extent" ? "market" : "division";
}

function createCaptureSourceSnapshot(sourceKey = state.activeTarget) {
  const info = pageInfo(sourceKey);
  const sourceId = sourceIdForTarget(sourceKey);
  const anchorResolved = Boolean(state.pdf.anchorResolved);
  const snapshotId = `${AgentOS.BOOK_REVISION}:${sourceId}:p${info.page}:r${state.pdf.renderToken}:a${anchorResolved ? "1" : "0"}`;
  return {
    sourceKey,
    source_key: sourceKey,
    source_id: sourceId,
    book_revision: AgentOS.BOOK_REVISION,
    page: info.page,
    pdfLoaded: Boolean(state.pdf.loaded),
    pdf_loaded: Boolean(state.pdf.loaded),
    anchorResolved,
    anchor_resolved: anchorResolved,
    snapshotId,
    snapshot_id: snapshotId,
  };
}

function isValidCaptureSourceSnapshot(snapshot) {
  if (!snapshot || !PAGE_MAP[snapshot.sourceKey]) return false;
  if (snapshot.book_revision !== AgentOS.BOOK_REVISION) return false;
  if (snapshot.source_id !== sourceIdForTarget(snapshot.sourceKey)) return false;
  if (!snapshot.pdfLoaded || !snapshot.anchorResolved || !snapshot.snapshotId) return false;
  return Boolean(AgentOS.SOURCE_BLOCKS?.[snapshot.sourceKey]);
}

function agentContext(sourceSnapshot = null) {
  const frozenSourceValid = isValidCaptureSourceSnapshot(sourceSnapshot);
  const pdfReady = Boolean(state.pdf.loaded && state.pdf.anchorResolved);
  return {
    active_source_ids: frozenSourceValid ? [sourceSnapshot.source_id] : pdfReady ? [sourceIdForTarget(state.activeTarget)] : [],
    source_snapshot: frozenSourceValid ? sourceSnapshot : undefined,
    active_world_id: state.agentOS.world?.world_id,
    world: state.agentOS.world,
    playable: state.playable,
    graph_id: state.agentOS.world?.graph_id,
    graph_revision: state.agentOS.world?.graph_revision || 1,
    expected_world_revision: state.agentOS.world?.revision,
    soft_return_declined: state.agentOS.softReturnDeclined,
    paused: state.agentOS.paused,
  };
}

function syncLegacyWorld(nextWorld, { events = [], observations = [] } = {}) {
  if (!nextWorld) return;
  state.agentOS.world = nextWorld;
  const legacy = AgentOS.legacyMirror(nextWorld);
  Object.assign(state.world, legacy);
  state.world.events = [...state.world.events, ...events.map((event) => ({
    id: event.id || event.event_id,
    title: event.kind === "character_refusal" ? "织工拒绝进一步专业化" : event.kind === "market_expanded" ? "扩大市场" : event.kind === "wool_gathered" ? "牧羊人送入羊毛" : event.kind === "yarn_spun" ? "纺纱工补上纱线" : event.kind === "weaver_specialized" ? "织工接受下一层专业化" : event.kind === "weaver_waited" ? "织工保持原工序" : event.kind === "market_constrained" ? "缩小市场范围" : "世界事件",
    message: event.message,
    action_id: event.action_id,
    event,
  }))];
  state.agentOS.events = [...state.agentOS.events, ...events];
  state.agentOS.observations = [...state.agentOS.observations, ...observations];
  state.world.runCount = state.agentOS.events.length;
  state.world.lastAction = events[events.length - 1]?.action_id ? AgentOS.ALLOWLIST[events[events.length - 1].action_id]?.ui_id : state.world.lastAction;
  state.world.market = legacy.market;
}

function renderAgentResponse(response, decision = state.agentOS.lastRoute?.decision) {
  if (!dom.agentOsResponse) return;
  dom.agentOsResponse.replaceChildren();
  const kind = document.createElement("span");
  kind.className = "agent-os-response__kind";
  kind.textContent = response?.type || "agent_os.response";
  dom.agentOsResponse.appendChild(kind);
  const body = document.createElement("span");
  body.className = "agent-os-response__answer";
  body.textContent = response?.text || response?.answer || "已完成这一轮判断。";
  dom.agentOsResponse.appendChild(body);
  if (response?.quote || response?.inference) {
    const boundary = document.createElement("div");
    boundary.className = "agent-os-response__boundary";
    if (response.quote) {
      const quote = document.createElement("div");
      quote.innerHTML = `<b>QUOTE · 原文</b> ${escapeHtml(response.quote.text)}`;
      boundary.appendChild(quote);
    }
    if (response.inference) {
      const inference = document.createElement("div");
      inference.innerHTML = `<b>INFERENCE · 推断</b> ${escapeHtml(response.inference.text)}`;
      boundary.appendChild(inference);
    }
    dom.agentOsResponse.appendChild(boundary);
    const meta = document.createElement("span");
    meta.className = "agent-os-response__meta";
    const ids = (response.source_ids || response.inference?.source_ids || []).join(" · ");
    meta.textContent = `source ${ids || "未绑定"} · confidence ${response.confidence || response.inference?.confidence || "unknown"}${response.open_question || response.inference?.open_question ? ` · open question：${response.open_question || response.inference.open_question}` : ""}`;
    dom.agentOsResponse.appendChild(meta);
  }
  if (response?.action_id || response?.next_moves?.length) {
    const action = document.createElement("span");
    action.className = "agent-os-response__action";
    action.textContent = response.action_id ? `ALLOWLIST · ${response.action_id}` : `下一步 · ${response.next_moves[0]}`;
    dom.agentOsResponse.appendChild(action);
  }
  if (decision) {
    const meta = document.createElement("span");
    meta.className = "agent-os-response__meta";
    meta.textContent = `intent ${decision.intent_class || "needs_clarification"} · relevance ${decision.relevance || "unknown"}`;
    dom.agentOsResponse.appendChild(meta);
  }
  if (dom.agentOsLed) dom.agentOsLed.textContent = response?.type === "soft_return" ? "SOFT RETURN" : response?.type === "source_discussion" ? "DISCUSS" : response?.type === "action_preview" ? "ACTION" : "READY";
  const speakable = response?.text || response?.answer;
  if (dom.agentOsSpeak) {
    dom.agentOsSpeak.disabled = !speakable;
    dom.agentOsSpeak.dataset.text = speakable || "";
  }
}

function renderThoughts() {
  if (!dom.agentOsThoughts) return;
  dom.agentOsThoughts.replaceChildren();
  state.agentOS.thoughts.slice(-3).forEach((thought) => {
    const card = document.createElement("article");
    card.className = "agent-os-thought";
    card.dataset.thoughtId = thought.thought_id;
    const head = document.createElement("div");
    head.className = "agent-os-thought__head";
    head.innerHTML = `<span>BOOKTHOUGHT · ${escapeHtml(thought.kind)}</span><span>${escapeHtml(thought.status)} · r${thought.revision}</span>`;
    card.appendChild(head);
    const textarea = document.createElement("textarea");
    textarea.rows = 2;
    textarea.value = thought.text;
    textarea.setAttribute("aria-label", "修订 BookThought");
    card.appendChild(textarea);
    const meta = document.createElement("div");
    meta.className = "agent-os-thought__meta";
    meta.textContent = `${thought.source_ids.join(" · ") || "无来源"} · confidence ${thought.confidence} · 历史 ${thought.revision_history.length} 版${thought.open_question ? ` · ${thought.open_question}` : ""}`;
    card.appendChild(meta);
    const actions = document.createElement("div");
    actions.className = "agent-os-thought__actions";
    [
      ["revise", "保存修订"],
      ["accept", "接受"],
      ["reject", "拒绝"],
    ].forEach(([action, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.thoughtAction = action;
      button.textContent = label;
      button.addEventListener("click", () => {
        const index = state.agentOS.thoughts.findIndex((entry) => entry.thought_id === thought.thought_id);
        if (index === -1) return;
        if (action === "revise") state.agentOS.thoughts[index] = AgentOS.reviseBookThought(thought, textarea.value, { changedBy: "reader", reason: "reader edited BookThought", now: new Date().toISOString() });
        else state.agentOS.thoughts[index] = { ...thought, status: action === "accept" ? "accepted" : "rejected" };
        renderThoughts();
      });
      actions.appendChild(button);
    });
    card.appendChild(actions);
    dom.agentOsThoughts.appendChild(card);
  });
}

function renderSoftReturn(response) {
  if (!dom.agentOsSoftReturn) return;
  const offered = response?.type === "soft_return" && response.offered && !state.agentOS.softReturnDeclined && !state.agentOS.paused;
  dom.agentOsSoftReturn.hidden = !offered;
  if (dom.agentOsContinue) dom.agentOsContinue.hidden = !state.agentOS.softReturnDeclined;
  const continueButton = dom.agentOsSoftReturn.querySelector("[data-soft-return-continue]");
  if (continueButton) continueButton.textContent = state.playable ? "看织工的选择 →" : "继续看市场范围 →";
}

function declineSoftReturn() {
  state.agentOS.softReturnDeclined = true;
  state.agentOS.paused = true;
  if (dom.agentOsSoftReturn) dom.agentOsSoftReturn.hidden = true;
  if (dom.agentOsContinue) dom.agentOsContinue.hidden = false;
  setVoiceStatus("stopped", "好的，先停在这里。阅读状态不会被改动。", "PAUSE");
  renderAgentResponse(AgentOS.softReturn("不用", { soft_return_declined: true }), { intent_class: "emotion_personal", relevance: "personal", confidence: "high" });
}

function continueFromSoftReturn() {
  state.agentOS.softReturnDeclined = false;
  state.agentOS.paused = false;
  if (dom.agentOsSoftReturn) dom.agentOsSoftReturn.hidden = true;
  if (dom.agentOsContinue) dom.agentOsContinue.hidden = true;
  if (state.playable) {
    setActiveTarget("market");
    setVoiceStatus("agent", "继续入口：可以看看织工在小市场下的选择。", "CONTINUE");
  } else {
    setActiveTarget("market");
    setVoiceStatus("agent", "继续入口：先读 PDF 45 的市场范围段落。", "CONTINUE");
  }
}

function submitAgentInput(text, { origin = "text", asrConfidence, activeSource = state.activeTarget, sourceSnapshot = null } = {}) {
  const cleaned = String(text || "").trim();
  if (/^继续(?:入口|阅读|一下)?$/.test(cleaned)) {
    continueFromSoftReturn();
    const continued = { type: "continued", response: { type: "continued", text: "继续入口已恢复；你可以继续阅读或提出一个新动作。", next_moves: ["继续阅读"] }, domain_mutation: false };
    state.agentOS.lastRoute = continued;
    renderAgentResponse(continued.response, { intent_class: "emotion_personal", relevance: "personal", confidence: "high" });
    return continued;
  }
  if (origin === "replay" && !isValidCaptureSourceSnapshot(sourceSnapshot) && !(state.pdf.loaded && state.pdf.anchorResolved)) {
    const blocked = {
      type: "source_unavailable",
      response: { type: "source_unavailable", text: "PDF 或当前原文锚点尚未就绪，Replay 暂不写入 Idea。", next_moves: ["等待 PDF"] },
      domain_mutation: false,
      decision: { intent_class: "source_unavailable", target_source_ids: [], confidence: "unknown" },
    };
    state.agentOS.lastRoute = blocked;
    state.agentOS.responses.push(blocked.response);
    renderAgentResponse(blocked.response, blocked.decision);
    renderSoftReturn(blocked.response);
    return blocked;
  }
  const explicitPause = /先停一下|停止输入|停止播报|不用了?|不想继续|退出/.test(cleaned);
  if (explicitPause) {
    if (state.voice.recording) stopVoice({ commit: false, reason: "explicit-stop" });
    else stopAgentOutput();
  }
  if (!cleaned) {
    const routed = AgentOS.routeAgentInput(cleaned, agentContext(sourceSnapshot));
    state.agentOS.lastRoute = routed;
    renderAgentResponse(routed.response, routed.decision);
    renderSoftReturn(routed.response);
    return routed;
  }
  const routeSource = sourceSnapshot?.sourceKey || sourceSnapshot?.source_key || activeSource;
  if (routeSource && PAGE_MAP[routeSource] && routeSource !== state.activeTarget) setActiveTarget(routeSource);
  const routed = AgentOS.routeAgentInput({ origin, text: cleaned, asr_confidence: asrConfidence, active_source_ids: sourceSnapshot?.source_id ? [sourceSnapshot.source_id] : undefined }, agentContext(sourceSnapshot));
  state.agentOS.lastRoute = routed;
  if (explicitPause || routed.type === "interrupted") {
    state.agentOS.softReturnDeclined = true;
    state.agentOS.paused = true;
  }
  state.agentOS.responses.push(routed.response);
  if (routed.thought) {
    state.agentOS.thoughts.push(routed.thought);
    renderThoughts();
  }
  renderAgentResponse(routed.response, routed.decision);
  renderSoftReturn(routed.response);
  if (routed.type === "source_discussion") {
    setVoiceStatus("agent", "Agent OS 已回答；引用、推断和开放问题分开显示。", "DISCUSS");
  } else if (routed.type === "action_failed") {
    setVoiceStatus("error", routed.action?.reason || routed.response.text, "BLOCK");
  } else if (routed.type === "soft_return") {
    setVoiceStatus("agent", routed.response.text, "SOFT");
  }
  // Replay keeps its existing anchored-Idea demo path.  Live/text source
  // questions do not silently become ReaderIdeas.
  if (origin === "replay") addIdea(cleaned, routeSource || state.activeTarget, "replay", { confidence: routed.decision?.confidence || "high" });
  else if (routed.type === "productive_detour" && origin === "text") addIdea(cleaned, routeSource || state.activeTarget, "text", { confidence: routed.decision?.confidence || "medium" });
  if (routed.type === "world_action" && routed.action?.ok) {
    routed.worldResult = runWorldAction(routed.action.ui_id, { input: cleaned, routed });
  }
  if (routed.type === "action_failed" && routed.action?.code === "ASR_UNCERTAIN") {
    setVoiceStatus("error", routed.action.reason, "REVIEW");
  }
  return routed;
}

function setPdfStatus(message, tone = "loading") {
  if (!dom.pdfStatus) return;
  dom.pdfStatus.textContent = `PDF · ${message}`;
  dom.pdfStatus.dataset.tone = tone;
}

function applyPageLabels() {
  Object.values(PAGE_MAP).forEach((info) => {
    setText(`[data-page-label="${info.key}"]`, `P. ${info.page}`);
    setText(`[data-folio-label="${info.key}"]`, String(info.page));
    setText(`[data-note-page="${info.key}"]`, `它会贴在第 ${info.page} 页旁边`);
    setText(`[data-anchor-label="${info.key}"]`, `第 ${info.page} 页 · ${info.label} Idea`);
    document.querySelectorAll(`[data-pdf-page]`).forEach((canvas) => {
      const key = canvas.id.toLowerCase().includes("45") || canvas.id.toLowerCase().includes("12") ? "market" : canvas.id.toLowerCase().includes("36") || canvas.id.toLowerCase().includes("10") ? "division" : null;
      if (key === info.key) {
        canvas.dataset.pdfPage = String(info.page);
        canvas.setAttribute("aria-label", `PDF 第 ${info.page} 页，${info.label}段落`);
      }
    });
  });
}

function setVariant(nextVariant, { updateUrl = true } = {}) {
  const variant = ["A", "B", "C"].includes(nextVariant) ? nextVariant : "B";
  state.variant = variant;
  dom.body.dataset.variant = variant;
  document.querySelectorAll("[data-variant-surface]").forEach((surface) => {
    surface.hidden = surface.dataset.variantSurface !== variant;
  });
  document.querySelectorAll(".variant-tabs button[data-variant]").forEach((button) => {
    const active = button.dataset.variant === variant;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  const labels = {
    A: "A · MARGIN OVERLAY",
    B: "B · SEGMENTED COMPOSITOR",
    C: "C · FOLD-OUT SPREAD",
  };
  if (dom.activeLayoutLabel) dom.activeLayoutLabel.textContent = labels[variant];
  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set("variant", variant);
    window.history.replaceState({}, "", url);
  }
  window.requestAnimationFrame(() => renderPdfPages());
  if (variant === "B") syncCompositeTextLayer();
}

function setActiveTarget(target) {
  if (!PAGE_MAP[target]) return;
  state.activeTarget = target;
  document.querySelectorAll("[data-source-target]").forEach((button) => {
    const active = button.dataset.sourceTarget === target;
    button.classList.toggle("is-current", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-anchor-target]").forEach((anchor) => {
    anchor.classList.toggle("is-selected", anchor.dataset.anchorTarget === target);
  });
  if (dom.workspaceState && !state.relationConnected) {
    const info = pageInfo(target);
    dom.workspaceState.textContent = `当前锚点 · PDF ${info.page} · ${info.label}`;
  }
}

function cloneWorldBlocks() {
  const template = document.querySelector("#worldTemplate");
  if (!template) return;
  worldSlots.forEach((slot, index) => {
    const fragment = template.content.cloneNode(true);
    const block = fragment.querySelector("[data-world-block]");
    if (!block) return;
    block.dataset.variantWorld = ["A", "B", "C"][index];
    slot.appendChild(fragment);
    const attached = slot.querySelector("[data-world-block]");
    if (attached) {
      worldBlocks.push(attached);
      attached.querySelectorAll("[data-world-action]").forEach((button) => {
        button.addEventListener("click", () => runWorldAction(button.dataset.worldAction));
      });
      hydrateRoleArt(attached);
    }
  });
}

async function headAssetExists(url) {
  try {
    const response = await fetch(url, { method: "HEAD", cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

async function hydrateRoleArt(block) {
  block.querySelectorAll("[data-role-art]").forEach(async (image) => {
    const role = image.dataset.roleArt;
    const candidates = ART_CANDIDATES[role] || [];
    let resolved = "";
    for (const candidate of candidates) {
      if (await headAssetExists(candidate)) {
        resolved = candidate;
        break;
      }
    }
    const card = image.closest(".role-card");
    if (!resolved) {
      card?.classList.add("art-missing");
      image.removeAttribute("src");
      return;
    }
    image.addEventListener("load", () => {
      card?.classList.add("has-art");
    }, { once: true });
    image.src = resolved;
  });
}

function graphReady() {
  return state.ideas.length >= 2 && state.ideas.some((idea) => idea.sourceKey === "division") && state.ideas.some((idea) => idea.sourceKey === "market");
}

function updateRelationProposal(ready) {
  if (!ready) {
    state.relation = { ...state.relation, source_ids: [], evidence_refs: [], status: "draft", stale: false, stale_reason: null };
    return;
  }
  const currentIdeas = [findIdea("division"), findIdea("market")].filter(Boolean);
  const sourceIds = [...new Set(currentIdeas.map((idea) => idea.source_id || sourceIdForTarget(idea.sourceKey)).filter(Boolean))];
  const evidenceRefs = [...new Set(currentIdeas.flatMap((idea) => Array.isArray(idea.evidence_refs) ? idea.evidence_refs : []))];
  state.relation = {
    ...state.relation,
    graph_id: state.agentOS.world.graph_id,
    graph_revision: state.agentOS.world.graph_revision,
    source_ids: sourceIds,
    evidence_refs: evidenceRefs,
    status: state.relation.status === "committed" && !state.relation.stale ? "committed" : "needs_review",
  };
}

function findIdea(sourceKey) {
  return state.ideas.find((idea) => idea.sourceKey === sourceKey);
}

function markRelationStale(reason = "reader_idea_revision") {
  if (state.relation.status !== "committed" && !state.relationConfirmed && !state.playable) return false;
  state.relation = {
    ...state.relation,
    status: "needs_review",
    stale: true,
    stale_reason: reason,
  };
  state.relationConfirmed = false;
  state.playable = false;
  state.world.collapsed = false;
  state.world.events = [];
  state.world.runCount = 0;
  state.world.market = "等待关系";
  state.agentOS.world = createAppAgentWorld();
  Object.assign(state.world, AgentOS.legacyMirror(state.agentOS.world), { events: [], runCount: 0, collapsed: false, lastAction: null });
  state.agentOS.events = [];
  state.agentOS.observations = [];
  if (dom.confirmRelation) {
    dom.confirmRelation.disabled = false;
    dom.confirmRelation.textContent = "确认这条关系";
  }
  if (dom.readyButton) dom.readyButton.textContent = "已经可以玩了";
  return true;
}

function createReaderIdea(text, sourceKey, origin, confidence = "medium") {
  const info = pageInfo(sourceKey);
  const source = AgentOS.SOURCE_BLOCKS?.[sourceKey];
  const sourceId = source?.source_id || sourceIdForTarget(sourceKey);
  const evidenceRefs = [...new Set([`pdf:${info.page}`, sourceId, ...(source?.evidence_refs || [])])];
  const now = new Date().toISOString();
  const turnId = `reader-turn-${Date.now()}-${++ideaSequence}`;
  return {
    id: `idea-${sourceKey}-${Date.now()}-${ideaSequence}`,
    turn_id: turnId,
    sourceKey,
    source_id: sourceId,
    source_anchor: {
      source_key: sourceKey,
      source_id: sourceId,
      book_revision: AgentOS.BOOK_REVISION,
      page: info.page,
      snapshot_id: `${AgentOS.BOOK_REVISION}:${sourceId}:p${info.page}`,
    },
    evidence_refs: evidenceRefs,
    confidence: confidence || "medium",
    status: "captured",
    revision: 1,
    revision_history: [{ revision: 1, text: String(text || "").trim(), changed_by: origin === "replay" ? "replay" : "reader", changed_at: now }],
    text: String(text || "").trim(),
    origin,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function reviseReaderIdea(idea, nextText, { changedBy = "reader", origin = idea?.origin, confidence = idea?.confidence } = {}) {
  if (!idea) return false;
  const cleaned = String(nextText || "").trim();
  if (!cleaned || cleaned === idea.text) return false;
  markRelationStale("reader_idea_revision");
  const nextRevision = Number(idea.revision || 1) + 1;
  const history = Array.isArray(idea.revision_history) ? idea.revision_history.slice() : [];
  history.push({ revision: nextRevision, text: cleaned, previous_text: idea.text, changed_by: changedBy, changed_at: new Date().toISOString(), supersedes: Number(idea.revision || 1) });
  idea.text = cleaned;
  idea.origin = origin || idea.origin;
  idea.confidence = confidence || idea.confidence || "medium";
  idea.status = "revised";
  idea.revision = nextRevision;
  idea.revision_history = history;
  idea.updatedAt = Date.now();
  return true;
}

function updateIdeaText(ideaId, nextText, options = {}) {
  const idea = state.ideas.find((entry) => entry.id === ideaId);
  if (!idea) return false;
  const revised = reviseReaderIdea(idea, nextText, options);
  if (revised) {
    renderConnection();
    updateOutcome();
  }
  return revised;
}

function addIdea(text, sourceKey = state.activeTarget, origin = "voice", { confidence = "medium" } = {}) {
  const cleaned = String(text || "").trim();
  if (!cleaned || !PAGE_MAP[sourceKey]) return false;
  const existing = findIdea(sourceKey);
  if (existing) {
    reviseReaderIdea(existing, cleaned, { changedBy: origin === "replay" ? "replay" : "reader", origin, confidence });
  } else {
    state.ideas.push(createReaderIdea(cleaned, sourceKey, origin, confidence));
  }
  setActiveTarget(sourceKey);
  renderIdeas();
  if (/可以玩|开始玩|开始运行|ready/i.test(cleaned) && state.relationConfirmed) {
    setPlayability(true);
  }
  return true;
}

function renderIdeas() {
  if (!dom.ideaList) return;
  dom.ideaList.replaceChildren();
  if (!state.ideas.length) {
    const empty = document.createElement("p");
    empty.className = "empty-ideas";
    empty.textContent = "还没有 Idea。先选择一个段落，再按语音或 Replay voice。";
    dom.ideaList.appendChild(empty);
  } else {
    state.ideas.forEach((idea, index) => {
      const info = pageInfo(idea.sourceKey);
      const card = document.createElement("article");
      card.className = `idea-card idea-card--${idea.sourceKey}`;
      card.dataset.ideaId = idea.id;
      card.innerHTML = `
        <div class="idea-card__index">${String(index + 1).padStart(2, "0")}</div>
        <div class="idea-card__body">
          <div class="idea-card__meta"><span>PDF ${info.page} · ${info.chapter}</span><span>${idea.origin === "replay" ? "RECORDED VOICE" : idea.origin === "text" ? "TEXT" : "LIVE VOICE"}</span></div>
          <textarea rows="2" aria-label="编辑 ${info.label} Idea">${escapeHtml(idea.text)}</textarea>
        </div>
        <button type="button" class="idea-card__remove" aria-label="删除 ${info.label} Idea">×</button>
      `;
      const input = card.querySelector("textarea");
      input.addEventListener("input", () => {
        updateIdeaText(idea.id, input.value, { changedBy: "reader", origin: "text-edit" });
      });
      card.querySelector(".idea-card__remove")?.addEventListener("click", () => {
        state.ideas = state.ideas.filter((entry) => entry.id !== idea.id);
        resetGraphIfNeeded();
        renderIdeas();
      });
      dom.ideaList.appendChild(card);
    });
  }

  const count = Math.min(state.ideas.length, 2);
  if (dom.ideaProgress) dom.ideaProgress.textContent = `${count} / 2`;
  if (dom.ledgerIdeas) dom.ledgerIdeas.textContent = `${count} / 2`;
  if (dom.anchorCount) dom.anchorCount.textContent = `${String(count).padStart(2, "0")} / 02`;
  renderConnection();
  updateOutcome();
}

function resetGraphIfNeeded() {
  if (graphReady()) return;
  state.relationConnected = false;
  state.relationConfirmed = false;
  state.playable = false;
  state.world.events = [];
  state.world.runCount = 0;
  state.world.collapsed = false;
  state.world.market = "等待关系";
  state.agentOS.world = createAppAgentWorld();
  state.agentOS.events = [];
  state.agentOS.observations = [];
  updateRelationProposal(false);
  renderWorldBlocks();
}

function renderConnection() {
  const ready = graphReady();
  updateRelationProposal(ready);
  state.relationConnected = ready;
  if (dom.relationCard) {
    dom.relationCard.hidden = !ready;
    dom.relationCard.dataset.relationStatus = state.relation.status;
    dom.relationCard.dataset.sourceIds = state.relation.source_ids.join(",");
    dom.relationCard.dataset.edgeType = state.relation.type;
  }
  if (dom.playabilityGate) dom.playabilityGate.hidden = !state.relationConfirmed;
  if (dom.connectionBanner) dom.connectionBanner.dataset.connected = ready ? "true" : "false";
  if (!ready) {
    if (dom.connectionText) dom.connectionText.textContent = "先在分工段落或市场范围段落留下一个 Idea。它会留在原文旁边。";
    if (dom.workspaceState) dom.workspaceState.textContent = `当前锚点 · PDF ${pageInfo(state.activeTarget).page} · ${pageInfo(state.activeTarget).label}`;
    if (dom.workspaceOrb) dom.workspaceOrb.dataset.state = "idle";
    if (dom.ledgerRelation) dom.ledgerRelation.textContent = "待接通";
  } else if (!state.relationConfirmed) {
    if (dom.connectionText) dom.connectionText.textContent = state.relation.stale ? "Idea 已修订；旧关系标为 needs_review。重新审阅后才能让世界生长。" : "两条 Idea 已在 PDF 锚点之间接通。先审阅 Agent 提议，再让世界生长。";
    if (dom.workspaceState) dom.workspaceState.textContent = state.relation.stale ? "关系已过期 · 等待重新确认" : "关系已接通 · 等待你的确认";
    if (dom.workspaceOrb) dom.workspaceOrb.dataset.state = "connected";
    if (dom.ledgerRelation) dom.ledgerRelation.textContent = "待确认";
  } else if (!state.playable) {
    if (dom.connectionText) dom.connectionText.textContent = "关系已确认。说“已经可以玩了”，或点击 Gate，世界会留在同一阅读界面。";
    if (dom.workspaceState) dom.workspaceState.textContent = "关系已确认 · 等待开始世界";
    if (dom.workspaceOrb) dom.workspaceOrb.dataset.state = "confirmed";
    if (dom.ledgerRelation) dom.ledgerRelation.textContent = "已确认";
  } else {
    if (dom.connectionText) dom.connectionText.textContent = "世界已在两段 PDF 原文之间展开。你可以停止、重试，再回到证据。";
    if (dom.workspaceState) dom.workspaceState.textContent = "WORLD LIVE · 可运行";
    if (dom.workspaceOrb) dom.workspaceOrb.dataset.state = "live";
    if (dom.ledgerRelation) dom.ledgerRelation.textContent = "已运行";
  }
  renderWorldBlocks();
}

function renderWorldBlocks({ syncText = true } = {}) {
  const anchorBlocked = !state.pdf.loaded || !state.pdf.anchorResolved;
  const worldVisible = state.relationConfirmed && state.playable && state.pdf.loaded && state.pdf.anchorResolved && !state.world.collapsed;
  if (dom.readyButton) dom.readyButton.disabled = !state.relationConfirmed || anchorBlocked;
  document.querySelectorAll(".world-waiting").forEach((waiting) => {
    waiting.hidden = worldVisible;
    waiting.closest(".world-slot")?.classList.toggle("is-collapsed", Boolean(state.world.collapsed && state.relationConnected));
    if (anchorBlocked && waiting.closest("#worldSlotB")) waiting.textContent = "ANCHOR UNRESOLVED · PDF page 45 目标短句未唯一匹配，B 暂停插入世界块。";
    else if (state.world.collapsed && waiting.closest("#worldSlotB")) waiting.textContent = "WORLD COLLAPSED · 已保留 Idea、关系和事件账；点击“继续世界”重新展开。";
  });
  worldBlocks.forEach((block) => {
    block.hidden = !worldVisible;
    block.dataset.phase = state.playable ? "playable" : state.relationConfirmed ? "confirmed" : "proposed";
    const stateLabel = block.querySelector("[data-world-state]");
    const gateNote = block.querySelector("[data-world-gate-note]");
    const footer = block.querySelector("[data-world-footer]");
    if (stateLabel) stateLabel.textContent = state.playable ? "WORLD LIVE" : state.relationConfirmed ? "关系已确认" : "等待关系确认";
    if (gateNote) gateNote.textContent = state.playable ? "动作已打开：比较小市场兼做与扩大市场后的专业化。" : state.relationConfirmed ? "关系已确认；点击上方“已经可以玩了”打开动作。" : "两条 Idea 已接通；确认关系后，世界才会接受动作。";
    if (footer) footer.textContent = state.playable ? "事件会回到 PDF 36 ↔ PDF 45" : "先确认关系，世界才会接受动作。";
    block.querySelectorAll("[data-world-action]").forEach((button) => {
      button.disabled = !state.playable;
      button.classList.toggle("is-selected", state.world.market !== "等待关系" && button.dataset.worldAction === state.world.lastAction);
    });
    block.querySelectorAll("[data-metric]").forEach((metric) => {
      const key = metric.dataset.metric;
      const value = Number(state.world[key] || 0);
      metric.textContent = String(value).padStart(2, "0");
    });
    block.querySelector("[data-world-log]")?.replaceChildren(worldLogNodes());
    block.querySelector("[data-role-observations]")?.replaceChildren(roleObservationNodes());
  });
  if (dom.ledgerWorld) dom.ledgerWorld.textContent = state.world.runCount ? `${state.world.runCount} 次运行` : state.relationConnected ? "待运行" : "未生长";
  updateOutcome();
  if (syncText && state.variant === "B") syncCompositeTextLayer();
}

function worldLogNodes() {
  const wrapper = document.createDocumentFragment();
  const label = document.createElement("span");
  label.className = "world-log__label";
  label.textContent = "EVENT LOG";
  wrapper.appendChild(label);
  if (!state.world.events.length) {
    const empty = document.createElement("p");
    empty.textContent = state.playable ? "选择一个动作，写入第一条世界事件。" : "等待读者确认关系。";
    wrapper.appendChild(empty);
    return wrapper;
  }
  const list = document.createElement("ol");
  state.world.events.slice(-3).forEach((event) => {
    const item = document.createElement("li");
    item.innerHTML = `<span>${event.id}</span><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.message)}</small>`;
    list.appendChild(item);
  });
  wrapper.appendChild(list);
  return wrapper;
}

function roleObservationNodes() {
  const wrapper = document.createDocumentFragment();
  const label = document.createElement("span");
  label.className = "world-log__label";
  label.textContent = "LOCAL OBSERVATIONS";
  wrapper.appendChild(label);
  if (!state.agentOS.observations.length) {
    const empty = document.createElement("p");
    empty.textContent = "角色会在动作事件后按因果顺序出现。";
    wrapper.appendChild(empty);
    return wrapper;
  }
  const list = document.createElement("ol");
  state.agentOS.observations.slice(-4).forEach((item) => {
    const row = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = `${item.character_id} · ${item.action}`;
    const small = document.createElement("small");
    small.textContent = `${item.speech} ${item.visible_effect}`;
    row.append(strong, small);
    list.appendChild(row);
  });
  wrapper.appendChild(list);
  return wrapper;
}

function runWorldAction(actionKey, { input = "", routed = null } = {}) {
  if (!state.playable || !state.pdf.loaded || !state.pdf.anchorResolved) {
    const failed = { ok: false, code: !state.pdf.loaded || !state.pdf.anchorResolved ? "PDF_NOT_READY" : "WORLD_NOT_READY", reason: !state.pdf.loaded || !state.pdf.anchorResolved ? "PDF 或原文锚点不可用，世界动作已暂停。" : "世界尚未打开。" };
    renderAgentResponse({ type: "action_failed", text: failed.reason, next_moves: ["确认关系并打开世界"] });
    return failed;
  }
  const allowlisted = AgentOS.ALLOWLIST[actionKey] || Object.values(AgentOS.ALLOWLIST).find((action) => action.ui_id === actionKey);
  if (!allowlisted) {
    const failed = { ok: false, code: "ACTION_UNSUPPORTED", reason: "动作不在 Agent OS allowlist。" };
    renderAgentResponse({ type: "action_failed", text: failed.reason });
    return failed;
  }
  const interpreted = routed?.action?.ok ? routed.action : AgentOS.interpretAction(input || allowlisted.label, { ...agentContext(), playable: true, expected_world_revision: state.agentOS.world.revision, graph_revision: state.agentOS.world.graph_revision });
  if (!interpreted.ok) {
    renderAgentResponse({ type: "action_failed", text: interpreted.reason, next_moves: ["修正动作"] }, interpreted);
    return interpreted;
  }
  const result = AgentOS.evolveWorld(state.agentOS.world, interpreted.action_id, {
    playable: true,
    activeWorldId: state.agentOS.world.world_id,
    graphId: state.agentOS.world.graph_id,
    graphRevision: state.agentOS.world.graph_revision,
    expectedWorldRevision: state.agentOS.world.revision,
  });
  if (!result.ok) {
    renderAgentResponse({ type: "action_failed", text: result.reason, next_moves: ["重试"] });
    return result;
  }
  syncLegacyWorld(result.nextWorld, { events: result.events, observations: result.observations });
  const lastObservation = result.observations[result.observations.length - 1];
  renderAgentResponse({
    type: "world_action",
    text: result.code === "CHARACTER_REFUSAL" ? lastObservation?.speech || result.reason : `已执行 ${interpreted.action.label}；世界事件和角色局部反应已记录。`,
    action_id: interpreted.action_id,
    next_moves: ["继续观察"],
  }, { intent_class: "executable_action", relevance: "mechanism_adjacent", confidence: "high" });
  if (dom.outcomePanel) dom.outcomePanel.hidden = false;
  renderWorldBlocks();
  updateOutcome();
  return result;
}

function setPlayability(enabled) {
  if (!state.relationConfirmed || state.relation.status !== "committed" || state.relation.stale || state.relation.graph_id !== state.agentOS.world.graph_id || state.relation.graph_revision !== state.agentOS.world.graph_revision) return false;
  if (!state.pdf.loaded || !state.pdf.anchorResolved) {
    setVoiceStatus("error", "PDF 或锚点尚未就绪；世界暂不打开。", "PDF");
    renderWorldBlocks();
    return false;
  }
  state.playable = Boolean(enabled);
  state.world.collapsed = false;
  if (state.playable) {
    state.agentOS.world = { ...state.agentOS.world, phase: "running", playable: true, graph_revision: state.agentOS.world.graph_revision || 1 };
    syncLegacyWorld(state.agentOS.world);
  }
  if (state.playable) {
    setVoiceStatus("gate", "世界已可玩；主动语音邀请现在才出现。", "READY");
    if (dom.gateTitle) dom.gateTitle.textContent = "世界已打开";
    if (dom.gateCopy) dom.gateCopy.textContent = "你可以用文字或语音提问；停止和重试都不会抹掉两条 Idea。";
    if (dom.readyButton) dom.readyButton.textContent = "世界已打开 ✓";
  }
  renderConnection();
  return state.playable;
}

function confirmRelation() {
  if (!state.relationConnected || state.relation.status !== "needs_review" || state.relation.source_ids.length < 2 || !state.relation.evidence_refs.length) return false;
  state.relation.status = "committed";
  state.relation.stale = false;
  state.relation.stale_reason = null;
  state.relationConfirmed = true;
  if (dom.confirmRelation) {
    dom.confirmRelation.disabled = true;
    dom.confirmRelation.textContent = "关系已确认 ✓";
  }
  renderConnection();
  return true;
}

function updateOutcome() {
  const division = findIdea("division");
  const market = findIdea("market");
  if (dom.outcomeDivision) dom.outcomeDivision.textContent = division?.text || "—";
  if (dom.outcomeMarket) dom.outcomeMarket.textContent = market?.text || "—";
  if (dom.outcomeResult) {
    dom.outcomeResult.textContent = state.world.events.length
      ? `${state.world.events[state.world.events.length - 1].title} · ${state.world.market}`
      : "等待一次运行";
  }
  if (dom.outcomeEvents) {
    dom.outcomeEvents.textContent = state.world.events.length
      ? `${state.world.events.length} 条世界事件 · 粗呢 ${state.world.output}/日 · 积压 ${Math.max(0, state.world.orders - state.world.stock)}`
      : "事件账将在第一次运行后出现。";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setVoiceStatus(kind, message, led = "IDLE") {
  if (dom.voiceStatus) {
    dom.voiceStatus.textContent = message;
    dom.voiceStatus.dataset.kind = kind;
  }
  if (dom.voiceStateLed) dom.voiceStateLed.textContent = led;
}

function stopAgentOutput() {
  state.agentOS.speechGeneration += 1;
  try { window.speechSynthesis?.cancel(); } catch { /* unsupported speech output */ }
  state.agentOS.speaking = false;
  if (dom.agentOsLed && dom.agentOsLed.textContent === "SPEAKING") dom.agentOsLed.textContent = "STOPPED";
}

function speakAgentResponse() {
  const text = dom.agentOsSpeak?.dataset.text || state.agentOS.lastRoute?.response?.text || state.agentOS.lastRoute?.response?.answer;
  if (!text || state.agentOS.muted || !window.speechSynthesis || !window.SpeechSynthesisUtterance) {
    if (state.agentOS.muted) setVoiceStatus("muted", "播报已静音；文字仍保留在 Agent OS 面板。", "MUTE");
    return;
  }
  stopAgentOutput();
  const speechGeneration = state.agentOS.speechGeneration + 1;
  state.agentOS.speechGeneration = speechGeneration;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  state.agentOS.speaking = true;
  state.agentOS.speechText = text;
  if (dom.agentOsLed) dom.agentOsLed.textContent = "SPEAKING";
  setVoiceStatus("speaking", "正在播报 Agent OS 回应；停止会立即取消输出。", "SPEAK");
  utterance.onend = () => {
    if (speechGeneration !== state.agentOS.speechGeneration) return;
    state.agentOS.speaking = false;
    if (dom.agentOsLed) dom.agentOsLed.textContent = "READY";
  };
  utterance.onerror = () => {
    if (speechGeneration !== state.agentOS.speechGeneration) return;
    state.agentOS.speaking = false;
    if (dom.agentOsLed) dom.agentOsLed.textContent = "ERROR";
  };
  window.speechSynthesis.speak(utterance);
}

function setTranscript(text, final = false) {
  state.voice.transcript = text;
  state.voice.transcriptFinal = Boolean(final);
  if (dom.transcriptLive) {
    dom.transcriptLive.textContent = text || (final ? "这一轮没有留下可提交的文字。" : "临时转写会显示在这里；尚未提交前不会进入关系图。");
    dom.transcriptLive.dataset.final = final ? "true" : "false";
  }
}

function commitVoiceTranscript(origin = "voice", asrConfidence = state.voice.finalConfidence) {
  const text = state.voice.transcript.trim();
  if (!text || state.voice.committed || (origin === "voice" && !state.voice.transcriptFinal)) return false;
  const sourceSnapshot = origin === "voice" ? state.voice.captureSource : null;
  if (origin === "voice" && (!sourceSnapshot || !sourceSnapshot.pdfLoaded || !sourceSnapshot.anchorResolved)) return false;
  state.voice.committed = true;
  const routed = submitAgentInput(text, { origin, asrConfidence, sourceSnapshot, activeSource: sourceSnapshot?.sourceKey || state.activeTarget });
  const statusTarget = sourceSnapshot?.sourceKey || state.activeTarget;
  if (origin === "replay") setVoiceStatus("replay", `Replay voice 已送入 Agent OS，并保留 PDF ${pageInfo(statusTarget).page} Idea。`, "REPLAY");
  else if (routed?.type !== "source_discussion" && routed?.type !== "soft_return" && routed?.type !== "world_action") setVoiceStatus("saved", `语音已送入 Agent OS；语音开始时锚定 PDF ${pageInfo(statusTarget).page}。`, "SAVED");
  return Boolean(routed);
}

function stopTracks() {
  state.voice.stream?.getTracks().forEach((track) => track.stop());
  state.voice.stream = null;
}

function stopVoice({ commit = true, reason = "user" } = {}) {
  stopAgentOutput();
  state.voice.requestGeneration += 1;
  state.voice.requesting = false;
  state.voice.recording = false;
  state.voice.captureGeneration += 1;
  if (state.voice.recognition) {
    try { state.voice.recognition.stop(); } catch { /* already stopped */ }
    state.voice.recognition = null;
  }
  if (state.voice.recorder && state.voice.recorder.state !== "inactive") {
    try { state.voice.recorder.stop(); } catch { /* already stopped */ }
  }
  state.voice.recorder = null;
  state.voice.chunks = [];
  stopTracks();
  if (dom.voiceButton) dom.voiceButton.classList.remove("is-recording");
  if (dom.voiceButtonLabel) dom.voiceButtonLabel.textContent = "使用麦克风说这一轮";
  if (dom.replayButton) dom.replayButton.disabled = false;
  if (commit) commitVoiceTranscript();
  state.voice.captureSource = null;
  state.voice.requesting = false;
  if (!state.voice.transcript && reason === "user") setVoiceStatus("stopped", "已停止；没有新的转写写入关系图。", "STOP");
  else if (reason === "user" && !state.voice.committed) setVoiceStatus("stopped", "已停止；你可以重试或改用 Replay voice。", "STOP");
}

function configureRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return null;
  const captureGeneration = state.voice.captureGeneration;
  const recognition = new Recognition();
  recognition.lang = "zh-CN";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.onstart = () => {
    if (captureGeneration !== state.voice.captureGeneration) return;
    setVoiceStatus("recording", "正在听这一轮；说完后会把最终句子提交给 Agent OS。", "LISTEN");
  };
  recognition.onresult = (event) => {
    if (captureGeneration !== state.voice.captureGeneration || !state.voice.recording) return;
    let interim = "";
    let finalText = "";
    let finalConfidence = null;
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result.isFinal) {
        finalText += result[0].transcript;
        const confidence = Number(result[0].confidence);
        if (Number.isFinite(confidence)) finalConfidence = finalConfidence == null ? confidence : Math.min(finalConfidence, confidence);
      }
      else interim += result[0].transcript;
    }
    const nextText = `${finalText || interim}`.trim();
    setTranscript(nextText, Boolean(finalText));
    if (finalText) {
      state.voice.finalConfidence = finalConfidence;
      commitVoiceTranscript("voice", finalConfidence);
    }
  };
  recognition.onerror = (event) => {
    if (captureGeneration !== state.voice.captureGeneration) return;
    stopVoice({ commit: false, reason: "recognition-error" });
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      setVoiceStatus("denied", "语音识别权限被拒绝；请继续用文字或 Replay voice。", "DENIED");
    } else {
      setVoiceStatus("error", `语音识别暂不可用（${event.error}）；可重试或 Replay voice。`, "ERROR");
    }
  };
  recognition.onend = () => {
    if (captureGeneration !== state.voice.captureGeneration) return;
    if (state.voice.recording) stopVoice({ commit: true, reason: "recognition-end" });
  };
  return recognition;
}

async function startVoice() {
  if (state.voice.recording) {
    stopVoice({ commit: true, reason: "user" });
    return false;
  }
  if (state.voice.requesting) {
    setVoiceStatus("requesting", "仍在请求这一轮的麦克风权限；不会重复发起请求。", "ASK");
    return false;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setVoiceStatus("unsupported", "当前浏览器不支持 getUserMedia；请用文字或 Replay voice。", "UNSUPPORT");
    return false;
  }
  const captureSource = createCaptureSourceSnapshot(state.activeTarget);
  state.voice.captureSource = captureSource;
  if (!captureSource.pdfLoaded || !captureSource.anchorResolved) {
    state.voice.captureSource = null;
    setVoiceStatus("unavailable", "PDF 或当前原文锚点尚未就绪；语音输入已安全暂停。", "PDF");
    return false;
  }
  state.voice.transcript = "";
  state.voice.transcriptFinal = false;
  state.voice.finalConfidence = null;
  state.voice.committed = false;
  state.voice.captureGeneration += 1;
  state.voice.requesting = true;
  state.voice.requestGeneration += 1;
  const requestGeneration = state.voice.requestGeneration;
  setTranscript("");
  setVoiceStatus("requesting", "正在请求麦克风权限……", "ASK");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (requestGeneration !== state.voice.requestGeneration || !state.voice.requesting) {
      stream?.getTracks?.().forEach((track) => track.stop());
      return false;
    }
    state.voice.stream = stream;
  } catch (error) {
    if (requestGeneration !== state.voice.requestGeneration) return false;
    const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
    state.voice.requesting = false;
    state.voice.captureSource = null;
    setVoiceStatus(denied ? "denied" : "error", denied ? "麦克风权限被拒绝；你仍可用文字或 Replay voice 完成阅读。" : "麦克风暂不可用；请重试或改用 Replay voice。", denied ? "DENIED" : "ERROR");
    return false;
  }
  state.voice.requesting = false;
  state.voice.recording = true;
  if (dom.voiceButton) dom.voiceButton.classList.add("is-recording");
  if (dom.voiceButtonLabel) dom.voiceButtonLabel.textContent = "停止并提交这一轮";
  if (dom.replayButton) dom.replayButton.disabled = true;
  if (window.MediaRecorder) {
    try {
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((candidate) => window.MediaRecorder.isTypeSupported?.(candidate));
      state.voice.recorder = new MediaRecorder(state.voice.stream, mime ? { mimeType: mime } : undefined);
      state.voice.chunks = [];
      state.voice.recorder.ondataavailable = (event) => {
        if (event.data?.size) state.voice.chunks.push(event.data);
      };
      state.voice.recorder.start(250);
    } catch {
      setVoiceStatus("recording", "麦克风已开启，但 MediaRecorder 不可用；语音识别仍在尝试。", "LISTEN");
    }
  }
  const recognition = configureRecognition();
  if (recognition) {
    state.voice.recognition = recognition;
    try { recognition.start(); } catch { setVoiceStatus("recording", "麦克风已开启；等待语音识别输入。", "LISTEN"); }
  } else {
    setVoiceStatus("unsupported", "麦克风已获授权，但浏览器不支持 SpeechRecognition；请按 Replay voice。", "MEDIA");
  }
  return true;
}

function replayVoice() {
  if (state.voice.recording || state.voice.requesting) stopVoice({ commit: false, reason: "replay" });
  if (!state.pdf.loaded || !state.pdf.anchorResolved) {
    setVoiceStatus("unavailable", "PDF 或当前原文锚点尚未就绪；Replay 暂不写入 Idea。", "PDF");
    return false;
  }
  const target = state.activeTarget;
  state.voice.committed = false;
  state.voice.finalConfidence = null;
  state.voice.transcript = REPLAY_TEXT[target];
  setTranscript(REPLAY_TEXT[target], true);
  submitAgentInput(REPLAY_TEXT[target], { origin: "replay", activeSource: target });
  setVoiceStatus("replay", `Replay voice 已送入 Agent OS，并保留 PDF ${pageInfo(target).page} Idea。`, "REPLAY");
}

function saveTextIdea() {
  const value = dom.textInput?.value.trim();
  if (!value) {
    dom.textInput?.focus();
    setVoiceStatus("text", "先输入问题、想法或明确动作，再提交给 Agent OS。", "TEXT");
    return;
  }
  submitAgentInput(value, { origin: "text", activeSource: state.activeTarget });
  dom.textInput.value = "";
  setVoiceStatus("saved", `文字已送入 Agent OS；当前锚点为 PDF ${pageInfo(state.activeTarget).page}。`, "SAVED");
}

function setupPdfFallback(error) {
  failClosedPdf(error, { loaded: false });
  state.pdf.error = error;
  setPdfStatus("主渲染失败 · 显式 fallback", "error");
  document.querySelectorAll("[data-page-shell]").forEach((shell) => shell.classList.add("pdf-load-error"));
  if (!dom.surface || dom.surface.querySelector(".pdf-native-fallback")) return;
  const fallback = document.createElement("section");
  fallback.className = "pdf-native-fallback";
  fallback.innerHTML = `<div><strong>PDF.js 本地模块未能读取 PDF</strong><span>以下仍是同一份实际 PDF 的浏览器 fallback；不是手写摘录。</span><small>${escapeHtml(PDF_URL)}</small></div>`;
  const embed = document.createElement("embed");
  embed.src = PDF_URL;
  embed.type = "application/pdf";
  embed.title = "Wealth of Nations Cannan Vol. I PDF fallback";
  fallback.appendChild(embed);
  dom.surface.appendChild(fallback);
}

function failClosedPdf(error, { loaded = false } = {}) {
  state.pdf.error = error || new Error("PDF render failed");
  state.pdf.loaded = Boolean(loaded);
  state.pdf.anchorResolved = false;
  state.pdf.renderToken += 1;
  state.playable = false;
  state.world.collapsed = false;
  state.world.market = "等待关系";
  state.agentOS.world = { ...state.agentOS.world, phase: "seeded", playable: false };
  renderWorldBlocks({ syncText: false });
}

async function getPdfPage(pageNumber) {
  if (!state.pdf.doc) throw new Error("PDF document not loaded");
  const actual = Math.min(Math.max(1, pageNumber), state.pdf.doc.numPages);
  if (state.pdf.pageCache.has(actual)) return state.pdf.pageCache.get(actual);
  const page = await state.pdf.doc.getPage(actual);
  const viewport = page.getViewport({ scale: 1.45 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  await page.render({ canvasContext: context, viewport }).promise;
  const result = { canvas, width: canvas.width, height: canvas.height, actual, page, viewport };
  state.pdf.pageCache.set(actual, result);
  return result;
}

function drawFull(source, target) {
  if (!target) return;
  target.width = source.width;
  target.height = source.height;
  const context = target.getContext("2d", { alpha: false });
  context.clearRect(0, 0, target.width, target.height);
  context.drawImage(source.canvas, 0, 0);
  target.closest("[data-page-shell]")?.classList.add("pdf-ready");
}

function drawSegment(source, target, type) {
  if (!target) return;
  const split = Math.round(SEGMENT_MANIFEST.cutYTopPt * source.viewport.scale);
  const height = type === "top" ? split : source.height - split;
  target.width = source.width;
  target.height = height;
  const context = target.getContext("2d", { alpha: false });
  context.clearRect(0, 0, target.width, target.height);
  context.drawImage(source.canvas, 0, type === "top" ? 0 : split, source.width, height, 0, 0, source.width, height);
  target.closest("[data-page-shell]")?.classList.add("pdf-ready");
}

function pageCutPx(source) {
  return Math.round(SEGMENT_MANIFEST.cutYTopPt * source.viewport.scale);
}

function countPhrase(normalized, phrase) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = normalized.indexOf(phrase, offset);
    if (index === -1) return count;
    count += 1;
    offset = index + phrase.length;
  }
}

function verifySegmentAnchor(textContent) {
  const normalized = textContent.items
    .map((item) => item.str || "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const counts = SEGMENT_MANIFEST.quoteFragments.map((fragment) => countPhrase(normalized, fragment));
  const titleCount = countPhrase(normalized, SEGMENT_MANIFEST.titleFragment);
  return {
    // The core body sentence must be unique. The diagnostic fragment can be
    // repeated by PDF side-notes/text streams; title context proves this is
    // the intended Chapter III page without treating that repetition as a
    // second anchor.
    ok: counts[0] === 1 && titleCount >= 1,
    normalized,
    counts,
    titleCount,
  };
}

function compositeLayerGeometry() {
  const page = document.querySelector(".segmented-page");
  const topCanvas = document.getElementById("bPage45Top");
  const bottomCanvas = document.getElementById("bPage45Bottom");
  const layer = document.getElementById("bPage45Text");
  if (!page || !topCanvas || !bottomCanvas || !layer || !state.pdf.doc) return null;
  const topRect = topCanvas.getBoundingClientRect();
  const bottomRect = bottomCanvas.getBoundingClientRect();
  const pageRect = page.getBoundingClientRect();
  if (!topRect.width || !bottomRect.width || !pageRect.width) return null;
  const scale = topRect.width / (state.pdf.pageCache.get(SEGMENT_MANIFEST.page)?.width || topRect.width);
  const gapCss = Math.max(0, bottomRect.top - topRect.bottom);
  const topOffsetCss = topRect.top - pageRect.top;
  const leftOffsetCss = topRect.left - pageRect.left;
  return { layer, topCanvas, bottomCanvas, scale, gapCss, topOffsetCss, leftOffsetCss };
}

async function renderCompositeTextLayer(source) {
  const target = document.getElementById("bPage45Text");
  if (!target || !state.pdf.pdfjs?.TextLayer || state.pdf.error) return;
  const geometry = compositeLayerGeometry();
  if (!geometry) return;
  target.replaceChildren();
  target.dataset.cutYTopPt = String(SEGMENT_MANIFEST.cutYTopPt);
  target.dataset.quote = SEGMENT_MANIFEST.quote;
  const sourceCutPx = pageCutPx(source);
  const gapSourcePx = geometry.gapCss / geometry.scale;
  target.style.left = `${geometry.leftOffsetCss}px`;
  target.style.top = `${geometry.topOffsetCss}px`;
  target.style.width = `${source.width}px`;
  // Keep the TextLayer's original page box while rendering. PDF.js positions
  // spans with percentages against this box; the visual world gap is applied
  // only to spans below the audited cut after render.
  target.style.height = `${source.height}px`;
  target.style.setProperty("--pdf-scale", String(geometry.scale));
  target.style.setProperty("--world-gap", `${geometry.gapCss}px`);
  target.style.setProperty("--cut-y", `${sourceCutPx}px`);
  try {
    const textContent = await source.page.getTextContent();
    const verification = verifySegmentAnchor(textContent);
    target.dataset.quoteMatches = verification.counts.join(",");
    target.dataset.titleMatches = String(verification.titleCount);
    if (!verification.ok) {
      failClosedPdf(new Error("PDF page 45 anchor unresolved"), { loaded: true });
      target.dataset.error = "anchor-unresolved";
      target.setAttribute("aria-label", "ANCHOR UNRESOLVED：PDF page 45 目标短句未唯一匹配");
      target.closest(".segmented-page")?.classList.add("anchor-unresolved");
      setPdfStatus("page 45 anchor unresolved", "error");
      renderWorldBlocks({ syncText: false });
      return;
    }
    state.pdf.anchorResolved = true;
    target.closest(".segmented-page")?.classList.remove("anchor-unresolved");
    const textLayer = new state.pdf.pdfjs.TextLayer({
      textContentSource: textContent,
      container: target,
      viewport: source.viewport,
    });
    await textLayer.render();
    const spans = [...target.querySelectorAll("span")];
    const cutPercent = (sourceCutPx / source.height) * 100;
    let shifted = 0;
    spans.forEach((span) => {
      const baseTopPercent = Number.parseFloat(span.style.top || "0");
      span.dataset.baseTopPercent = String(baseTopPercent);
      const startsBelowCut = baseTopPercent >= cutPercent;
      if (startsBelowCut) {
        const existingTransform = span.style.transform || "none";
        span.style.transform = `translateY(${gapSourcePx}px) ${existingTransform}`;
        shifted += 1;
      }
    });
    target.dataset.shiftedSpans = String(shifted);
    target.closest(".segmented-page")?.classList.add("text-layer-ready");
    renderWorldBlocks({ syncText: false });
  } catch (error) {
    failClosedPdf(error, { loaded: true });
    target.dataset.error = "true";
    target.setAttribute("aria-label", "PDF 文本层加载失败；仍保留实际 PDF 视觉");
  }
}

function syncCompositeTextLayer() {
  if (!state.pdf.loaded || state.pdf.error) return;
  const source = state.pdf.pageCache.get(SEGMENT_MANIFEST.page);
  if (!source) return;
  window.requestAnimationFrame(() => renderCompositeTextLayer(source));
}

async function renderPdfPages() {
  if (!state.pdf.doc) return;
  const token = ++state.pdf.renderToken;
  try {
    const pageEntries = await Promise.all(Object.values(PAGE_MAP).map(async (info) => [info.key, await getPdfPage(info.page)]));
    if (token !== state.pdf.renderToken) return;
    const pages = Object.fromEntries(pageEntries);
    pdfCanvasSpecs.forEach((spec) => {
      const canvas = document.getElementById(spec.id);
      if (!canvas) return;
      const source = pages[spec.page];
      if (!source) return;
      if (spec.kind === "full") drawFull(source, canvas);
      else drawSegment(source, canvas, spec.kind);
    });
    await renderCompositeTextLayer(pages.market);
  } catch (error) {
    setupPdfFallback(error);
  }
}

async function loadPdf() {
  setPdfStatus("正在读取本地 PDF", "loading");
  state.pdf.error = null;
  state.pdf.anchorResolved = false;
  try {
    const pdfjs = await import(PDFJS_URL);
    state.pdf.pdfjs = pdfjs;
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(PDF_WORKER_URL, import.meta.url).toString();
    const loadingTask = pdfjs.getDocument({ url: PDF_URL, disableAutoFetch: false, disableStream: false });
    state.pdf.doc = await loadingTask.promise;
    state.pdf.loaded = true;
    setPdfStatus(`${state.pdf.doc.numPages} 页 · 本地渲染`, "ready");
    await renderPdfPages();
  } catch (error) {
    setupPdfFallback(error);
  }
}

function returnToReading() {
  state.world.collapsed = true;
  dom.outcomePanel?.removeAttribute("hidden");
  document.querySelector("#reopenWorld")?.removeAttribute("hidden");
  renderWorldBlocks();
  // Evidence return keeps the market/source segment that produced the latest
  // world action in focus; it must not silently jump to the other PDF page.
  state.activeTarget = "market";
  setActiveTarget("market");
  document.querySelector(".reader-surface")?.scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelector('[data-anchor-target="market"]')?.focus({ preventScroll: true });
}

function reopenWorld() {
  if (!state.relationConfirmed) return;
  state.world.collapsed = false;
  document.querySelector("#reopenWorld")?.setAttribute("hidden", "");
  renderWorldBlocks();
  document.querySelector("#worldSlotB")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function startClock() {
  const startedAt = Date.now();
  window.setInterval(() => {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const seconds = String(elapsed % 60).padStart(2, "0");
    if (dom.sessionClock) dom.sessionClock.textContent = `${minutes}:${seconds}`;
  }, 1000);
}

function wireUi() {
  document.querySelectorAll(".variant-tabs button[data-variant]").forEach((button) => {
    button.addEventListener("click", () => setVariant(button.dataset.variant));
  });
  document.querySelectorAll("[data-source-target]").forEach((button) => {
    button.addEventListener("click", () => setActiveTarget(button.dataset.sourceTarget));
  });
  document.querySelectorAll("[data-anchor-target]").forEach((anchor) => {
    anchor.addEventListener("click", () => setActiveTarget(anchor.dataset.anchorTarget));
    anchor.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setActiveTarget(anchor.dataset.anchorTarget);
      }
    });
  });
  dom.voiceButton?.addEventListener("click", startVoice);
  dom.replayButton?.addEventListener("click", replayVoice);
  dom.textSubmit?.addEventListener("click", saveTextIdea);
  dom.agentOsSpeak?.addEventListener("click", speakAgentResponse);
  dom.agentOsMute?.addEventListener("click", () => {
    state.agentOS.muted = !state.agentOS.muted;
    if (state.agentOS.muted) stopAgentOutput();
    dom.agentOsMute.textContent = state.agentOS.muted ? "取消静音" : "静音";
    setVoiceStatus("agent", state.agentOS.muted ? "播报已静音。" : "播报已恢复。", state.agentOS.muted ? "MUTE" : "READY");
  });
  dom.agentOsStopOutput?.addEventListener("click", () => {
    stopAgentOutput();
    if (state.voice.recording) stopVoice({ commit: false, reason: "agent-stop" });
    setVoiceStatus("stopped", "已停止输入和播报；没有新的领域事实写入。", "STOP");
  });
  dom.agentOsSoftReturn?.querySelector("[data-soft-return-decline]")?.addEventListener("click", declineSoftReturn);
  dom.agentOsSoftReturn?.querySelector("[data-soft-return-continue]")?.addEventListener("click", continueFromSoftReturn);
  dom.agentOsContinue?.addEventListener("click", continueFromSoftReturn);
  dom.textInput?.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") saveTextIdea();
  });
  dom.confirmRelation?.addEventListener("click", confirmRelation);
  dom.readyButton?.addEventListener("click", () => setPlayability(true));
  dom.returnToReading?.addEventListener("click", returnToReading);
  document.querySelector("#reopenWorld")?.addEventListener("click", reopenWorld);
  window.addEventListener("resize", () => {
    if (state.pdf.loaded) {
      window.clearTimeout(window.__livingReaderResizeTimer);
      window.__livingReaderResizeTimer = window.setTimeout(() => renderPdfPages(), 180);
    }
  });
  window.addEventListener("keydown", (event) => {
    const target = document.activeElement;
    if (target && (target.matches("textarea, input") || target.isContentEditable)) return;
    if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      replayVoice();
    }
  });
}

function init() {
  applyPageLabels();
  cloneWorldBlocks();
  setVariant(state.variant, { updateUrl: false });
  setActiveTarget(state.activeTarget);
  renderIdeas();
  renderThoughts();
  renderAgentResponse({ type: "ready", text: "可以问原文、提出世界动作，或随时先停一下。" }, { intent_class: null, relevance: "unknown", confidence: "high" });
  wireUi();
  startClock();
  loadPdf();
  window.__livingReader = {
    state,
    addIdea,
    replayVoice,
    setVariant,
    runWorldAction,
    submitAgentInput,
    editIdea: updateIdeaText,
    getReaderIdeas: () => JSON.parse(JSON.stringify(state.ideas)),
    getAgentOSState: () => JSON.parse(JSON.stringify({ ...state.agentOS, relation: state.relation, ideas: state.ideas, activeTarget: state.activeTarget, pdf: { loaded: state.pdf.loaded, anchorResolved: state.pdf.anchorResolved } })),
    getVisibleWorldMetrics: () => ({ output: state.world.output, stock: state.world.stock, orders: state.world.orders, cash: state.world.cash, market: state.world.market }),
    getPdfState: () => ({ loaded: state.pdf.loaded, anchorResolved: state.pdf.anchorResolved, error: state.pdf.error ? String(state.pdf.error.message || state.pdf.error) : null, playable: state.playable }),
    simulatePdfFailure: (layer = "render") => {
      failClosedPdf(new Error(`simulated-${layer}-failure`), { loaded: layer === "text-layer" });
      return { loaded: state.pdf.loaded, anchorResolved: state.pdf.anchorResolved, playable: state.playable };
    },
    getVoiceState: () => ({ recording: state.voice.recording, requesting: state.voice.requesting, requestGeneration: state.voice.requestGeneration, transcriptFinal: state.voice.transcriptFinal, finalConfidence: state.voice.finalConfidence, captureGeneration: state.voice.captureGeneration, captureSource: state.voice.captureSource ? JSON.parse(JSON.stringify(state.voice.captureSource)) : null }),
    declineSoftReturn,
    continueFromSoftReturn,
    stopAgentOutput,
  };
}

init();
