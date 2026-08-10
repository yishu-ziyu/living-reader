/* PROTOTYPE ONLY — DOM/CSS + Web Animations renderer for the wool-town sim.
   The sim (sim.js) owns state; this file only projects state into the DOM,
   mirroring the product's presentation-plan separation. */

import {
  act,
  clockOf,
  createWorld,
  EXPAND_COST,
  metricsOf,
  rushState,
  stepWorld,
  TICK_MS,
} from "./sim.js";

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = (id) => document.getElementById(id);
const scene = $("scene");
const eventLog = $("eventLog");
const tokenLayer = $("tokenLayer");

const TOKEN_SPRITE = {
  wool: "./assets/wool.png",
  yarn: "./assets/yarn.png",
  cloth: "./assets/cloth.png",
  coin: "./assets/coin.png",
};

// token flight paths, in % of scene box
const TOKEN_PATH = {
  wool: { from: [16, 66], to: [33, 60] },
  yarn: { from: [38, 62], to: [58, 60] },
  cloth: { from: [63, 62], to: [84, 58] },
  coin: { from: [88, 52], to: [96, 6] },
};

const PILE_SPRITE = { pileWool: "wool", pileYarn: "yarn", pileCloth: "cloth" };
const BAR_MAX = { output: 30, stock: 30, orders: 8, cash: 60 };

let world = createWorld(42);
let ready = false;

/* ------------------------------------------------------------ rendering */
function renderMetrics() {
  const m = metricsOf(world);
  const pairs = [
    ["Supply", m.output, BAR_MAX.output],
    ["Stock", m.stock, BAR_MAX.stock],
    ["Orders", m.reachable_orders, BAR_MAX.orders],
    ["Cash", m.cash, BAR_MAX.cash],
  ];
  for (const [key, value, max] of pairs) {
    $(`num${key}`).textContent = String(value);
    $(`bar${key}`).style.width = `${Math.min(100, (value / max) * 100)}%`;
  }
}

function flashMetric(key) {
  const el = document.querySelector(`.metric-bar[data-metric="${key}"]`);
  if (!el || REDUCED) return;
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
}

function renderPiles() {
  for (const [pileId, kind] of Object.entries(PILE_SPRITE)) {
    const pile = $(pileId);
    const count = world.inv[kind];
    pile.textContent = "";
    const shown = Math.min(count, 5);
    for (let i = 0; i < shown; i += 1) {
      const img = document.createElement("img");
      img.src = TOKEN_SPRITE[kind];
      img.alt = "";
      pile.appendChild(img);
    }
    if (count > shown) {
      const badge = document.createElement("span");
      badge.className = "pile-count";
      badge.textContent = `+${count - shown}`;
      pile.appendChild(badge);
    }
  }
}

function renderStatus() {
  const state = rushState(world);
  scene.dataset.rush = state;
  $("systemStatus").textContent =
    state === "rushing" ? "RUSHING" : state === "resting" ? "LOOM RESTING" : "MARKET OPEN";
}

function renderClock() {
  $("clockReadout").textContent = clockOf(world);
  $("revReadout").textContent = `REV ${world.revision}`;
}

function renderSummary() {
  const m = metricsOf(world);
  $("domSummary").textContent = [
    `${clockOf(world)} · REV ${world.revision}`,
    `供给 ${m.output} / 库存 ${m.stock}（原毛 ${world.inv.wool} · 纱线 ${world.inv.yarn} · 粗呢 ${world.inv.cloth}）`,
    `可触达订单 ${m.reachable_orders}（上限 ${world.orderCap}） · 现金 ${m.cash} 银币 · 粗呢售价 ${world.price}`,
    `织机状态：${rushState(world) === "rushing" ? "赶单全速" : rushState(world) === "resting" ? "停工休整" : "常态运转"}`,
  ].join("\n");
}

function appendLog(events) {
  for (const ev of events) {
    const li = document.createElement("li");
    li.className = `event ${ev.kind}`;
    const time = document.createElement("time");
    time.textContent = ev.clock.split("· ")[1] ?? ev.clock;
    const span = document.createElement("span");
    span.textContent = ev.text;
    li.append(time, span);
    eventLog.appendChild(li);
  }
  while (eventLog.children.length > 60) eventLog.removeChild(eventLog.firstChild);
  eventLog.scrollTop = eventLog.scrollHeight;
}

function flyToken(kind) {
  const path = TOKEN_PATH[kind];
  if (!path) return;
  const img = document.createElement("img");
  img.className = "token";
  img.src = TOKEN_SPRITE[kind];
  img.alt = "";
  const box = scene.getBoundingClientRect();
  const x = (pct) => (pct / 100) * box.width;
  const y = (pct) => (pct / 100) * box.height;
  img.style.left = `${x(path.from[0])}px`;
  img.style.top = `${y(path.from[1])}px`;
  tokenLayer.appendChild(img);
  const dx = x(path.to[0]) - x(path.from[0]);
  const dy = y(path.to[1]) - y(path.from[1]);
  if (REDUCED) {
    window.setTimeout(() => img.remove(), 120);
    return;
  }
  const anim = img.animate(
    [
      { transform: "translate(0, 0)", opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy - 26}px)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px)`, opacity: kind === "coin" ? 0 : 1 },
    ],
    { duration: 950, easing: "linear" },
  );
  anim.onfinish = () => img.remove();
}

function handleEvents(events) {
  if (events.length === 0) return;
  appendLog(events);
  for (const ev of events) {
    if (ev.token) {
      flyToken(ev.token);
      if (ev.token === "coin") flashMetric("cash");
      if (ev.token === "wool" || ev.token === "yarn" || ev.token === "cloth") {
        flashMetric("stock");
      }
    }
  }
}

function refreshButtons() {
  $("btnExpand").disabled = !ready || world.cash < EXPAND_COST;
  $("btnRush").disabled =
    !ready || world.cooldownTicks > 0 || world.rushTicks > 0 || world.restTicks > 0;
}

function renderAll() {
  renderMetrics();
  renderPiles();
  renderStatus();
  renderClock();
  renderSummary();
  refreshButtons();
}

/* -------------------------------------------------------------- main loop */
function tick() {
  const events = stepWorld(world);
  handleEvents(events);
  renderAll();
}

function runConstruction() {
  const stageEl = $("constructionStage");
  const overlay = $("construction");
  const labels = [
    "正在固定规则与初始数值",
    "角色进入，库存就位",
    "材料流开始连接",
    "世界可以操作",
  ];
  const finish = () => {
    scene.dataset.stage = "3";
    overlay.classList.add("done");
    ready = true;
    $("worldCaption").textContent = "牧羊人 → 纺纱工 → 织工 → 商人 · 材料流已接通";
    $("worldPhase").textContent = "LIVE";
    appendLog([
      { clock: clockOf(world), text: "镇志开启：羊毛镇 rev 0 进入可操作状态。", kind: "action" },
    ]);
    renderAll();
  };
  if (REDUCED) {
    finish();
    return;
  }
  const schedule = [0, 620, 1240, 1860];
  schedule.forEach((delay, index) => {
    window.setTimeout(() => {
      scene.dataset.stage = String(index);
      stageEl.textContent = labels[index];
      if (index === 3) window.setTimeout(finish, 500);
    }, delay);
  });
}

$("btnExpand").addEventListener("click", () => {
  const result = act(world, "expand_market");
  handleEvents(result.events);
  if (result.ok) {
    flashMetric("orders");
    flashMetric("output");
    flyToken("coin");
  }
  renderAll();
});

$("btnRush").addEventListener("click", () => {
  const result = act(world, "rush_weaver");
  handleEvents(result.events);
  renderAll();
});

$("btnReset").addEventListener("click", () => {
  world = createWorld(42);
  eventLog.textContent = "";
  appendLog([
    { clock: clockOf(world), text: "世界已按 SEED 42 重置：同一操作序列将精确重演。", kind: "ghost" },
  ]);
  renderAll();
});

renderAll();
runConstruction();
window.setInterval(tick, TICK_MS);
