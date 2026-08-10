/* PROTOTYPE ONLY — DOM/CSS + Web Animations renderer for the wool-town sim.
   The sim (sim.js) owns state; this file only projects state into the DOM,
   mirroring the product's presentation-plan separation.
   T070: place topology focus. Switching places does not mutate economy. */

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
  wool: { from: [12, 62], to: [34, 58] },
  yarn: { from: [38, 58], to: [58, 58] },
  cloth: { from: [62, 58], to: [84, 60] },
  coin: { from: [84, 52], to: [70, 30] },
};

const PILE_SPRITE = { pileWool: "wool", pileYarn: "yarn", pileCloth: "cloth" };
const BAR_MAX = { output: 30, stock: 30, orders: 8, cash: 60 };

let world = createWorld(42);
let ready = false;
let focusPlaceId = "workshop";

const PLACES = {
  market: {
    id: "market",
    label: "村落市集",
    status: "open",
    occupants: ["商人"],
    connections: ["工坊", "通往邻镇的路（未开通）"],
    note: "订单在这里形成。路通之前，只能服务附近村子。",
  },
  workshop: {
    id: "workshop",
    label: "工坊",
    status: "open",
    occupants: ["纺纱工", "织工"],
    connections: ["村落市集", "仓房"],
    note: "纺与织在同一工坊里分岗。焦点在这里时，你主要看生产压力。",
  },
  storehouse: {
    id: "storehouse",
    label: "仓房",
    status: "open",
    occupants: ["牧羊人", "羊群"],
    connections: ["工坊"],
    note: "原毛与成品在这里积压或出货。库存高时压力最大。",
  },
  road: {
    id: "road",
    label: "通往邻镇的路",
    status: "locked",
    occupants: ["无人"],
    connections: ["村落市集"],
    note: "这条路还没开通。本刀只证明它可见且不可进入，不在这里做扩展补丁。",
  },
};

const OPEN_PLACE_IDS = ["market", "workshop", "storehouse"];

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

function placePressure(placeId) {
  const m = metricsOf(world);
  if (placeId === "market") {
    if (m.reachable_orders <= 2) return "订单偏少，市场偏窄";
    if (m.reachable_orders >= world.orderCap) return "订单已顶到上限";
    return `可触达订单 ${m.reachable_orders}/${world.orderCap}`;
  }
  if (placeId === "workshop") {
    const rush = rushState(world);
    if (rush === "rushing") return "织机全速赶单";
    if (rush === "resting") return "织机停工休整";
    if (world.inv.yarn === 0) return "纱线不足，织部等待";
    return "常态运转";
  }
  if (placeId === "storehouse") {
    if (m.stock >= 18) return "库存偏高，有积压";
    if (m.stock <= 4) return "库存偏低，供给吃紧";
    return `库存 ${m.stock}（毛${world.inv.wool}/纱${world.inv.yarn}/呢${world.inv.cloth}）`;
  }
  return "未开通，不可进入";
}

function placeStocks(placeId) {
  if (placeId === "market") return `在售粗呢关注 · 现金 ${world.cash}`;
  if (placeId === "workshop") return `纱线 ${world.inv.yarn} · 产出 ${world.output}`;
  if (placeId === "storehouse") {
    return `原毛 ${world.inv.wool} · 纱线 ${world.inv.yarn} · 粗呢 ${world.inv.cloth}`;
  }
  return "无本地库存";
}

function renderPlaceFocus() {
  const place = PLACES[focusPlaceId] ?? PLACES.workshop;
  scene.dataset.focus = place.id;
  $("focusTitle").textContent = place.label;
  $("focusStatus").textContent = place.status === "open" ? "开放" : "锁定 / 未开通";
  $("focusOccupants").textContent = place.occupants.join(" · ");
  $("focusStocks").textContent = placeStocks(place.id);
  $("placePressure").textContent = placePressure(place.id);
  $("focusConnections").textContent = place.connections.join(" · ");
  $("focusNote").textContent = place.note;

  for (const node of document.querySelectorAll(".place-node")) {
    const id = node.dataset.place;
    const active = id === place.id;
    node.dataset.active = active ? "true" : "false";
    node.setAttribute("aria-current", active ? "true" : "false");
  }

  for (const id of OPEN_PLACE_IDS) {
    const el = document.querySelector(`[data-node-pressure="${id}"]`);
    if (el) el.textContent = placePressure(id);
  }
}

function setFocusPlace(placeId, { announce = false } = {}) {
  const place = PLACES[placeId];
  if (!place) return;
  if (place.status === "locked") {
    if (announce) {
      appendLog([
        {
          clock: clockOf(world),
          text: "通往邻镇的路仍锁定：本刀只展示地点拓扑，不在这里开通扩展。",
          kind: "ghost",
        },
      ]);
    }
    return;
  }
  if (focusPlaceId === placeId) {
    renderPlaceFocus();
    return;
  }
  focusPlaceId = placeId;
  renderPlaceFocus();
  if (announce && ready) {
    appendLog([
      {
        clock: clockOf(world),
        text: `焦点移到${place.label}。切换地点不改写经济事实。`,
        kind: "action",
      },
    ]);
  }
}

function renderSummary() {
  const m = metricsOf(world);
  const place = PLACES[focusPlaceId] ?? PLACES.workshop;
  $("domSummary").textContent = [
    `${clockOf(world)} · REV ${world.revision}`,
    `当前焦点：${place.label}（${place.status === "open" ? "开放" : "锁定"}）`,
    `在场：${place.occupants.join("、")} · 压力：${placePressure(place.id)}`,
    `地点：村落市集 / 工坊 / 仓房 可切换；通往邻镇的路锁定`,
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
  renderPlaceFocus();
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
    $("worldCaption").textContent = "地点拓扑已展开 · 点左侧地点切换焦点";
    $("worldPhase").textContent = "LIVE";
    appendLog([
      { clock: clockOf(world), text: "镇志开启：羊毛镇 rev 0 进入可操作状态。", kind: "action" },
      {
        clock: clockOf(world),
        text: "地点：村落市集 / 工坊 / 仓房可切换；通往邻镇的路锁定。",
        kind: "ghost",
      },
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
  focusPlaceId = "workshop";
  appendLog([
    { clock: clockOf(world), text: "世界已按 SEED 42 重置：同一操作序列将精确重演。", kind: "ghost" },
  ]);
  renderAll();
});

for (const node of document.querySelectorAll(".place-node")) {
  node.addEventListener("click", () => {
    setFocusPlace(node.dataset.place, { announce: true });
  });
}

window.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === "1") setFocusPlace("market", { announce: true });
  if (event.key === "2") setFocusPlace("workshop", { announce: true });
  if (event.key === "3") setFocusPlace("storehouse", { announce: true });
  if (event.key === "4") setFocusPlace("road", { announce: true });
});

setFocusPlace("workshop");
renderAll();
runConstruction();
window.setInterval(tick, TICK_MS);
