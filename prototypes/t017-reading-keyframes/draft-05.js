const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const AgentOS = window.LivingReaderAgentOS;
if (!AgentOS) throw new Error("LivingReaderAgentOS must load before draft-05.js");

const orbPresentations = {
  resting: {
    label: "准备好了",
    detail: ({ page }) => `开始后，我会围绕 ${page} 的当前原文听你说。`,
  },
  listening: {
    label: "正在听你说",
    detail: ({ page }) => `当前声音只绑定到启动时冻结的 ${page} 原文。`,
  },
  thinking: {
    label: "正在整理你的理解",
    detail: () => "我会先区分你的原话、书中证据和仍待确认的推断。",
  },
  speaking: {
    label: "陪读正在回应",
    detail: () => "市场范围可能是这条理解成立的边界，我们可以回到 PDF 45 核对。",
  },
};

const orbControlLabels = {
  resting: "关闭陪读",
  listening: "停止聆听并关闭陪读",
  thinking: "取消当前回复并关闭陪读",
  speaking: "取消当前回复并关闭陪读",
};
const sourceSnapshots = {
  source36: { page: "PDF 36", title: "Of the division of labour" },
  source45: {
    page: "PDF 45",
    title: "That the division of labour is limited by the extent of the market",
  },
};
const orbStage = document.querySelector(".orb-stage");
const orbControl = document.querySelector("[data-thinking-orb-main]");
const orbLabel = document.querySelector("[data-orb-label]");
const orbDetail = document.querySelector("[data-orb-detail]");
const agentFocus = document.querySelector(".agent-focus");
const agentSurface = document.querySelector(".agent-surface");
const orbTrigger = document.querySelector(".orb-trigger");
const readingStage = document.querySelector(".reading-stage");
const relation = document.querySelector(".relation-margin");
const relationConfirm = document.querySelector(".relation-confirm");
const worldPlate = document.querySelector(".world-plate");
const worldScene = document.querySelector(".engraving-scene");
const worldStatus = document.querySelector(".world-status");

let orbState = "resting";
let activeSource = sourceSnapshots.source36;
let lastFocus = null;
let lastScrollX = 0;
let lastScrollY = 0;
let worldHideTimer = null;
let currentWorld = AgentOS.createInitialWorld({ phase: "running" });
let lastCommittedPlayback = null;
let playbackController = null;
const activeMaterialAnimations = new Set();
let worldActionBar = null;
let materialFlowLayer = null;
let eventRibbon = null;
let eventLog = null;
let roleObservation = null;


function setOrbState(nextState) {
  const isResting = nextState === "resting";

  orbState = nextState;
  const presentation = orbPresentations[nextState];
  orbStage.dataset.orbState = nextState;
  orbLabel.textContent = presentation.label;
  orbDetail.textContent = presentation.detail(activeSource);
  orbControl.setAttribute("aria-label", orbControlLabels[nextState]);

  window.dispatchEvent(
    new CustomEvent("draft05:orb-state", {
      detail: { state: nextState, paused: isResting },
    }),
  );
}

function setActiveSource(sourceId) {
  const nextSource = sourceSnapshots[sourceId];
  if (!nextSource) return;

  activeSource = nextSource;
  if (orbState === "resting" || orbState === "listening") {
    orbDetail.textContent = orbPresentations[orbState].detail(activeSource);
  }
}

function openAgent() {
  lastFocus = document.activeElement;
  lastScrollX = window.scrollX;
  lastScrollY = window.scrollY;
  agentFocus.classList.add("is-open");
  agentFocus.setAttribute("aria-hidden", "false");
  orbTrigger.setAttribute("aria-expanded", "true");
  readingStage.inert = true;
  document.body.style.overflow = "hidden";
  window.requestAnimationFrame(() => orbControl.focus({ preventScroll: true }));
}

function closeAgent() {
  agentFocus.classList.remove("is-open");
  agentFocus.setAttribute("aria-hidden", "true");
  orbTrigger.setAttribute("aria-expanded", "false");
  readingStage.inert = false;
  document.body.style.overflow = "";
  const focusTarget = lastFocus && document.contains(lastFocus) ? lastFocus : orbTrigger;
  focusTarget.focus({ preventScroll: true });
  window.scrollTo(lastScrollX, lastScrollY);
}

function stopOrCancelAndCloseAgent() {
  if (orbState !== "resting") setOrbState("resting");
  closeAgent();
}

const worldActionIds = ["expand_market", "deepen_specialization", "constrain_market"];
const roleLabels = {
  shepherd: "牧羊人",
  spinner: "纺纱工",
  weaver: "织工",
  merchant: "商人",
};
const stanceLabels = {
  ready: "准备",
  waiting: "等待",
  working: "工作",
  shipping: "发货",
  hold: "暂停交易",
};
const materialRoutes = {
  market_expanded: ["merchant", "shepherd", "订单"],
  wool_gathered: ["shepherd", "spinner", "原毛"],
  yarn_spun: ["spinner", "weaver", "纱线"],
  weaver_specialized: ["weaver", "merchant", "粗呢"],
  weaver_waited: ["weaver", "weaver", "等待"],
  specialization_deepened: ["weaver", "merchant", "粗呢"],
  character_refusal: ["weaver", "weaver", "拒绝"],
  market_constrained: ["merchant", "weaver", "积压"],
};
const deltaLabels = {
  market_size: "市场范围",
  reachable_orders: "可达订单",
  demand: "需求",
  transport_cost: "运输成本",
  open_orders: "待处理订单",
  cash: "现金",
  raw_wool: "原毛",
  yarn: "纱线",
  output: "产出",
  cloth: "粗呢库存",
  orders_fulfilled: "已履行订单",
  switching_loss: "换工损耗",
  backlog: "积压",
};

function readableDelta(delta) {
  return Object.entries(delta || {}).flatMap(([key, value]) => {
    if (typeof value === "number" && value !== 0) {
      const sign = value > 0 ? "+" : "−";
      return [`${deltaLabels[key] || key} ${sign}${Math.abs(value)}`];
    }
    if (value && typeof value === "object") return readableDelta(value);
    return [];
  });
}


function ensureWorldHook(selector, tagName, parent) {
  const existing = worldPlate.querySelector(selector);
  if (existing) return existing;
  const hook = document.createElement(tagName);
  parent.append(hook);
  return hook;
}

function installWorldRuntime() {
  const plateFoot = worldPlate.querySelector(".plate-foot");

  worldActionBar = ensureWorldHook(".world-action-bar", "div", plateFoot);
  worldActionBar.className = "world-action-bar";
  worldActionBar.setAttribute("aria-label", "世界行动与视觉回放");

  for (const actionId of worldActionIds) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.worldCommand = actionId;
    button.textContent = AgentOS.ALLOWLIST[actionId].label;
    worldActionBar.append(button);
  }

  for (const [command, label] of [
    ["stop", "Stop 视觉回放"],
    ["replay", "Replay 最近行动"],
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "playback-control";
    button.dataset.worldCommand = command;
    button.textContent = label;
    worldActionBar.append(button);
  }

  materialFlowLayer = ensureWorldHook(".material-flow-layer", "div", worldScene);
  materialFlowLayer.className = "material-flow-layer";
  materialFlowLayer.setAttribute("aria-hidden", "true");

  eventRibbon = ensureWorldHook(".event-ribbon", "div", worldScene);
  eventRibbon.className = "event-ribbon";
  eventRibbon.setAttribute("aria-live", "polite");
  eventRibbon.hidden = true;

  eventLog = ensureWorldHook("[data-event-log]", "ol", plateFoot);
  eventLog.dataset.eventLog = "";
  eventLog.setAttribute("aria-label", "确定性世界事件");
  eventLog.hidden = true;

  roleObservation = ensureWorldHook("[data-role-observation]", "p", plateFoot);
  roleObservation.dataset.roleObservation = "";
  roleObservation.setAttribute("aria-live", "polite");
  roleObservation.hidden = true;

  worldActionBar.addEventListener("click", (event) => {
    const command = event.target.closest("button[data-world-command]")?.dataset.worldCommand;
    if (!command) return;
    if (command === "stop") {
      stopVisualPlayback();
    } else if (command === "replay") {
      replayLastAction();
    } else {
      commitWorldAction(command);
    }
  });
}

function renderWorld(world, stanceOverrides = {}) {
  for (const role of worldScene.querySelectorAll(".role[data-role]")) {
    const roleId = role.dataset.role;
    const actor = world.actors[roleId];
    if (!actor) continue;

    role.dataset.stance = stanceOverrides[roleId] || actor.stance;
    const summary = role.querySelector(".role-caption span:not([data-metric])");
    const metric = role.querySelector("[data-metric]");
    if (summary) summary.textContent = stanceLabels[actor.stance] || actor.stance;

    if (roleId === "shepherd") {
      metric.dataset.metric = "raw_wool";
      metric.textContent = `原毛 ${world.inventory.raw_wool}`;
    }
    if (roleId === "spinner") {
      metric.dataset.metric = "yarn";
      metric.textContent = `纱线 ${world.inventory.yarn}`;
    }
    if (roleId === "weaver") {
      metric.dataset.metric = "production";
      metric.textContent = `粗呢 ${world.inventory.cloth} · 产出 ${world.production.output}`;
    }
    if (roleId === "merchant") {
      metric.dataset.metric = "reachable_orders";
      metric.textContent = `可达订单 ${world.market.reachable_orders} · 积压 ${world.orders.backlog}`;
    }
  }

  worldPlate.querySelector(".model-note p").textContent =
    `${world.market.exchange_open ? "交换开放" : "小市场"}：可触达订单 ${world.market.reachable_orders}，` +
    `产出 ${world.production.output}，粗呢 ${world.inventory.cloth}，现金 ${world.cash}。数值由确定性 WorldKernel 生成。`;
}

function updateWorldControls() {
  const running = Boolean(playbackController);
  worldActionBar.querySelectorAll("button[data-world-command]").forEach((button) => {
    const command = button.dataset.worldCommand;
    if (worldActionIds.includes(command)) button.disabled = running;
    if (command === "stop") button.disabled = !running;
    if (command === "replay") button.disabled = running || !lastCommittedPlayback;
  });
}

function clearActiveRoles() {
  worldScene.querySelectorAll(".role[data-role]").forEach((role) => role.classList.remove("is-active"));
}

function clearPlaybackFeedback() {
  eventLog.replaceChildren();
  eventLog.hidden = true;
  eventRibbon.textContent = "";
  eventRibbon.hidden = true;
  roleObservation.textContent = "";
  roleObservation.hidden = true;
}

function buildEventWorld(beforeWorld, event, stances) {
  const actors = Object.fromEntries(
    Object.entries(beforeWorld.actors).map(([roleId, actor]) => [
      roleId,
      { ...actor, ...event.after.actors[roleId], stance: stances[roleId] || actor.stance },
    ]),
  );
  return { ...beforeWorld, ...event.after, actors };
}

function observationForEvent(playback, event) {
  return playback.observations.find((entry) => entry.trigger.event_ids.includes(event.event_id));
}

function renderEventFeedback(playback, event, stances) {
  const observation = observationForEvent(playback, event);
  if (observation?.local_state?.stance) stances[observation.character_id] = observation.local_state.stance;
  renderWorld(buildEventWorld(playback.beforeWorld, event, stances), stances);

  clearActiveRoles();
  const activeRole = worldScene.querySelector(`.role[data-role="${event.character_id}"]`);
  if (activeRole) {
    activeRole.classList.add("is-active");
    activeRole.dataset.stance = observation?.action || stances[event.character_id];
  }

  eventRibbon.dataset.kind = event.kind;
  eventRibbon.textContent = event.message;
  eventRibbon.hidden = false;

  const item = document.createElement("li");
  item.dataset.eventKind = event.kind;
  const message = document.createElement("span");
  message.textContent = `${String(event.sequence).padStart(2, "0")} · ${roleLabels[event.character_id] || "世界"} · ${event.message}`;
  item.append(message);
  const changes = readableDelta(event.delta);
  if (changes.length > 0) {
    const delta = document.createElement("span");
    delta.dataset.delta = "";
    delta.textContent = changes.join(" · ");
    item.append(delta);
  }
  eventLog.append(item);
  eventLog.hidden = false;

  if (observation) {
    roleObservation.textContent =
      `${roleLabels[observation.character_id]}：“${observation.speech}” ${observation.visible_effect}`;
    roleObservation.hidden = false;
  }
}

function waitForPlayback(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Playback stopped", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function animateMaterial(event, signal) {
  const [fromId, toId, label] = materialRoutes[event.kind] || [
    event.character_id,
    event.character_id,
    "状态",
  ];
  const fromRole = worldScene.querySelector(`.role[data-role="${fromId}"]`);
  const toRole = worldScene.querySelector(`.role[data-role="${toId}"]`);
  if (!fromRole || !toRole) {
    await waitForPlayback(720, signal);
    return;
  }

  const layerRect = materialFlowLayer.getBoundingClientRect();
  const fromRect = fromRole.getBoundingClientRect();
  const toRect = toRole.getBoundingClientRect();
  const token = document.createElement("span");
  token.className = "material-token";
  token.dataset.eventKind = event.kind;
  token.dataset.character = event.character_id || "";
  token.textContent = label;
  token.style.left = `${fromRect.left + fromRect.width / 2 - layerRect.left}px`;
  token.style.top = `${fromRect.top + fromRect.height * 0.58 - layerRect.top}px`;
  materialFlowLayer.append(token);

  const animation = token.animate(
    [
      { opacity: 0, transform: "translate(-50%, -50%) scale(0.8)" },
      { opacity: 1, offset: 0.18, transform: "translate(-50%, -65%) scale(1)" },
      {
        opacity: 1,
        offset: 0.82,
        transform: `translate(calc(-50% + ${toRect.left + toRect.width / 2 - fromRect.left - fromRect.width / 2}px), calc(-50% + ${toRect.top + toRect.height * 0.58 - fromRect.top - fromRect.height * 0.58}px)) scale(1)`,
      },
      {
        opacity: 0,
        transform: `translate(calc(-50% + ${toRect.left + toRect.width / 2 - fromRect.left - fromRect.width / 2}px), calc(-50% + ${toRect.top + toRect.height * 0.58 - fromRect.top - fromRect.height * 0.58}px)) scale(0.84)`,
      },
    ],
    { duration: 720, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" },
  );
  activeMaterialAnimations.add(animation);

  try {
    await waitForPlayback(760, signal);
  } finally {
    animation.cancel();
    activeMaterialAnimations.delete(animation);
    token.remove();
  }
}

function finishPlayback(playback, replayed) {
  playbackController = null;
  renderWorld(currentWorld);
  clearActiveRoles();
  worldScene.dataset.running = "false";
  worldScene.dataset.worldState = playback.code === "CHARACTER_REFUSAL" ? "refused" : "committed";
  worldStatus.textContent =
    playback.code === "CHARACTER_REFUSAL"
      ? "行动已提交：织工拒绝进一步专业化"
      : `${AgentOS.ALLOWLIST[playback.actionId].label}：${replayed ? "回放完成" : "已提交"}`;
  updateWorldControls();
}

function renderReducedPlayback(playback, replayed) {
  clearPlaybackFeedback();
  const stances = Object.fromEntries(
    Object.entries(playback.beforeWorld.actors).map(([roleId, actor]) => [roleId, actor.stance]),
  );
  for (const event of playback.events) renderEventFeedback(playback, event, stances);
  finishPlayback(playback, replayed);
}

async function playCommittedEvents(playback, replayed = false) {
  if (prefersReducedMotion.matches) {
    renderReducedPlayback(playback, replayed);
    return;
  }

  clearPlaybackFeedback();
  renderWorld(playback.beforeWorld);
  clearActiveRoles();
  const controller = new AbortController();
  playbackController = controller;
  worldScene.dataset.running = "true";
  worldScene.dataset.worldState = replayed ? "replaying" : "running";
  worldStatus.textContent = replayed ? "正在重放最近行动" : "世界状态已提交，正在回放事件";
  updateWorldControls();

  const stances = Object.fromEntries(
    Object.entries(playback.beforeWorld.actors).map(([roleId, actor]) => [roleId, actor.stance]),
  );

  try {
    for (const event of playback.events) {
      renderEventFeedback(playback, event, stances);
      await animateMaterial(event, controller.signal);
    }
    if (playbackController === controller) finishPlayback(playback, replayed);
  } catch (error) {
    if (error.name !== "AbortError") throw error;
  }
}

function stopVisualPlayback() {
  if (!playbackController) return;
  playbackController.abort();
  playbackController = null;
  activeMaterialAnimations.forEach((animation) => animation.cancel());
  activeMaterialAnimations.clear();
  materialFlowLayer.replaceChildren();
  renderWorld(currentWorld);
  clearActiveRoles();
  worldScene.dataset.running = "false";
  worldScene.dataset.worldState = "paused";
  worldStatus.textContent = "视觉回放已停止，已提交的世界状态保留";
  updateWorldControls();
}

function commitWorldAction(actionId) {
  if (!worldActionIds.includes(actionId) || playbackController) return;
  const result = AgentOS.evolveWorld(currentWorld, actionId, {
    activeWorldId: currentWorld.world_id,
    graphId: currentWorld.graph_id,
    graphRevision: currentWorld.graph_revision,
    expectedWorldRevision: currentWorld.revision,
  });

  if (!result.ok) {
    worldScene.dataset.worldState = "error";
    worldStatus.textContent = result.reason;
    return;
  }

  currentWorld = result.nextWorld;
  lastCommittedPlayback = {
    actionId,
    code: result.code,
    beforeWorld: result.world,
    events: result.events.slice().sort((left, right) => left.sequence - right.sequence),
    observations: result.observations,
  };
  playCommittedEvents(lastCommittedPlayback);
}

function replayLastAction() {
  if (!lastCommittedPlayback || playbackController) return;
  playCommittedEvents(lastCommittedPlayback, true);
}

function revealWorld() {
  window.clearTimeout(worldHideTimer);
  relation.classList.add("is-confirmed");
  relationConfirm.setAttribute("aria-expanded", "true");
  relationConfirm.textContent = "关系已确认";
  worldPlate.hidden = false;
  window.requestAnimationFrame(() => worldPlate.classList.add("is-visible"));
}

function hideWorld() {
  stopVisualPlayback();
  worldPlate.classList.remove("is-visible");
  relationConfirm.setAttribute("aria-expanded", "false");
  relationConfirm.textContent = "重新展开世界";
  worldHideTimer = window.setTimeout(() => {
    worldPlate.hidden = true;
    relationConfirm.focus({ preventScroll: true });
  }, prefersReducedMotion.matches ? 0 : 220);
}

orbTrigger.addEventListener("click", () => {
  setOrbState("listening");
  openAgent();
});
agentFocus.addEventListener("click", (event) => {
  if (event.target === agentFocus || event.target.closest?.("[data-agent-close]")) {
    stopOrCancelAndCloseAgent();
  }
});
orbControl.addEventListener("click", stopOrCancelAndCloseAgent);
orbControl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  stopOrCancelAndCloseAgent();
});

document.querySelectorAll("[data-note-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const passage = button.closest(".passage");
    setActiveSource(passage?.id);
    setOrbState("thinking");
    openAgent();
  });
});

relationConfirm.addEventListener("click", revealWorld);
document.querySelector("[data-world-close]").addEventListener("click", hideWorld);

document.querySelector("[data-jump]").addEventListener("click", () => {
  const target = document.getElementById(document.querySelector("[data-jump]").dataset.jump);
  target.scrollIntoView({ block: "start", behavior: prefersReducedMotion.matches ? "auto" : "smooth" });
  target.querySelector("h2").setAttribute("tabindex", "-1");
  target.querySelector("h2").focus({ preventScroll: true });
});

agentSurface.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const focusable = [
    ...agentSurface.querySelectorAll(
      '[data-thinking-orb-main][tabindex="0"], button:not([disabled]):not([hidden])',
    ),
  ];
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && agentFocus.classList.contains("is-open")) stopOrCancelAndCloseAgent();
});

installWorldRuntime();
renderWorld(currentWorld);
worldScene.dataset.running = "false";
worldScene.dataset.worldState = "ready";
worldStatus.textContent = "运行中：小市场等待行动";
updateWorldControls();

setOrbState("resting");
