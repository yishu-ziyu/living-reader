/*
 * PROTOTYPE ONLY.
 * One visual direction, one causal sequence, no production engine or LLM calls.
 */

const PAPER = "#d9dfd2";
const BRIGHT = "#edf1e7";
const INK = "#101511";

const art = {};
const artSources = {
  baker: "./assets/baker-kneading-dough.png",
  wheat: "./assets/wheat.png",
  stall: "./assets/market-stall.png",
  coins: "./assets/coins.png",
  injunction: "./assets/injunction.png",
  worker: "./assets/factory-worker.png",
  factory: "./assets/factory.png",
  bread: "./assets/bread-dough-served.png",
};

Object.entries(artSources).forEach(([key, src]) => {
  const image = new Image();
  image.src = src;
  art[key] = image;
});

const canvas = document.querySelector("#worldCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const runButton = document.querySelector("#runButton");
const resetButton = document.querySelector("#resetButton");
const policyInput = document.querySelector("#policyInput");
const compiledRule = document.querySelector("#compiledRule");
const eventLog = document.querySelector("#eventLog");
const worldCaption = document.querySelector("#worldCaption");
const worldPhase = document.querySelector("#worldPhase");
const systemStatus = document.querySelector("#systemStatus");
const statusLamp = document.querySelector(".status-lamp");
const priceMetric = document.querySelector("#priceMetric");
const stockMetric = document.querySelector("#stockMetric");
const queueMetric = document.querySelector("#queueMetric");
const clockReadout = document.querySelector("#clockReadout");
const focusReticle = document.querySelector("#focusReticle");
const ledgerWindow = document.querySelector(".ledger-window");
const expandLedger = document.querySelector("#expandLedger");

const steps = [
  {
    at: 500,
    time: "06:03",
    phase: "SEMANTIC COMPILE",
    caption: "法令被理解为：所有面包零售价不得超过 2 银币。",
    event: "语义裁决完成：PRICE_CAP / bread / 2.0 silver。",
    action: "compile",
  },
  {
    at: 1450,
    time: "06:10",
    phase: "PRICE CAP ACTIVE",
    caption: "价格牌被强制改写：4 → 2。顾客开始聚集。",
    event: "法令生效：面包标价从 4.0 降至 2.0 银币。",
    action: "price",
  },
  {
    at: 2750,
    time: "07:20",
    phase: "PRODUCTION HALT",
    caption: "麦粉 1.7 + 燃料 0.5 + 工时 0.4。每条面包亏损 0.6。",
    event: "面包师拒绝第二炉订单：售价低于单位成本 2.6。",
    action: "halt",
  },
  {
    at: 4100,
    time: "09:00",
    phase: "SHORTAGE",
    caption: "货架售空。排队没有消失，只是价格不再传递短缺。",
    event: "库存降至 0；11 名居民仍有未满足需求。",
    action: "shortage",
  },
  {
    at: 5550,
    time: "10:35",
    phase: "SECOND ORDER EFFECT",
    caption: "暗巷出现转售：官方价格 2，实际成交价 7。",
    event: "居民 07 以 7.0 银币转售最后一条面包。",
    action: "blackmarket",
  },
  {
    at: 7100,
    time: "11:00",
    phase: "CAUSAL TRACE READY",
    caption: "法令压低了标价，却没有压低成本，也没有创造面包。",
    event: "因果链闭合：价格封顶 → 亏损 → 停炉 → 缺货 → 转售。",
    action: "done",
  },
];

const sim = {
  running: false,
  startedAt: 0,
  elapsed: 0,
  step: -1,
  state: "baseline",
  price: 4,
  stock: 24,
  queue: 0,
  smoke: 1,
  shutters: 0,
  blackMarket: 0,
};

function pxRect(x, y, w, h, color = INK) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function pxText(text, x, y, size = 7, color = INK, align = "left") {
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.fillText(text, Math.round(x), Math.round(y));
}

function ditherRect(x, y, w, h, gap = 4, invert = false) {
  ctx.fillStyle = invert ? PAPER : INK;
  for (let yy = 0; yy < h; yy += gap) {
    for (let xx = (yy / gap) % 2 ? gap / 2 : 0; xx < w; xx += gap) {
      ctx.fillRect(Math.round(x + xx), Math.round(y + yy), 1, 1);
    }
  }
}

function line(x1, y1, x2, y2, width = 1, color = INK) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
  ctx.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
  ctx.stroke();
}

function drawArt(key, x, y, width, height, alpha = 1) {
  const image = art[key];
  if (!image?.complete || !image.naturalWidth) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  ctx.restore();
}

function drawCloud(x, y, scale = 1) {
  pxRect(x + 2 * scale, y, 12 * scale, 2 * scale);
  pxRect(x, y + 2 * scale, 18 * scale, 3 * scale);
  pxRect(x + 5 * scale, y - 2 * scale, 7 * scale, 2 * scale);
}

function drawPerson(x, y, opts = {}) {
  const { dir = 1, apron = false, hat = false, bag = false, frame = 0, pale = false } = opts;
  const c = pale ? PAPER : INK;
  const s = dir;

  pxRect(x + 4, y, 5, 4, c);
  pxRect(x + 3, y + 3, 7, 3, c);
  if (hat) {
    pxRect(x + 2, y - 2, 8, 2, c);
    pxRect(x + 4, y - 4, 5, 2, c);
  }
  pxRect(x + 3, y + 6, 7, 10, c);
  if (apron) {
    pxRect(x + 5, y + 8, 3, 7, pale ? INK : PAPER);
  }
  pxRect(x + (s > 0 ? 9 : 1), y + 8, 4, 2, c);
  if (bag) {
    pxRect(x + (s > 0 ? 12 : -2), y + 10, 4, 5, c);
    pxRect(x + (s > 0 ? 13 : -1), y + 8, 2, 2, c);
  }
  const stride = frame % 2;
  pxRect(x + 3 - stride, y + 16, 3, 6, c);
  pxRect(x + 7 + stride, y + 16, 3, 6, c);
  pxRect(x + 2 - stride, y + 21, 4, 2, c);
  pxRect(x + 7 + stride, y + 21, 4, 2, c);
}

function drawBread(x, y, empty = false) {
  if (empty) {
    line(x, y + 7, x + 18, y + 7);
    return;
  }
  for (let i = 0; i < 3; i += 1) {
    pxRect(x + i * 6, y + 2, 5, 5);
    pxRect(x + 1 + i * 6, y, 3, 2);
    pxRect(x + 2 + i * 6, y + 1, 1, 1, PAPER);
  }
}

function drawBuilding(x, y, w, h, type) {
  pxRect(x, y, w, h, PAPER);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

  for (let row = y + 7; row < y + h - 5; row += 6) {
    for (let col = x + ((row / 6) % 2 ? 3 : 6); col < x + w - 3; col += 9) {
      line(col, row, col + 5, row);
    }
  }

  if (type === "bakery") {
    pxRect(x + 9, y + 24, w - 18, 18, INK);
    pxText("BREAD / 面包", x + w / 2, y + 29, 6, PAPER, "center");
    pxRect(x + 13, y + 51, 31, 28, INK);
    pxRect(x + 16, y + 54, 25, 22, PAPER);
    if (sim.stock <= 1) {
      drawBread(x + 19, y + 61, true);
    } else {
      drawArt("bread", x + 16, y + 55, 25, 16);
    }
    pxRect(x + w - 33, y + 51, 19, h - 53, INK);
    pxRect(x + w - 29, y + 56, 11, h - 58, PAPER);
    const shutter = Math.floor(sim.shutters * (h - 60));
    if (shutter > 0) {
      pxRect(x + w - 29, y + 56, 11, shutter, INK);
      for (let sy = y + 57; sy < y + 56 + shutter; sy += 4) line(x + w - 29, sy, x + w - 18, sy, 1, PAPER);
    }
    pxRect(x + w - 20, y - 28, 10, 30, INK);
    pxRect(x + w - 18, y - 25, 6, 24, PAPER);
    pxRect(x + w - 22, y - 30, 14, 4, INK);
  }

  if (type === "grain") {
    pxRect(x + 8, y + 20, w - 16, 17, INK);
    pxText("GRAIN & FUEL", x + w / 2, y + 25, 6, PAPER, "center");
    for (let i = 0; i < 3; i += 1) {
      pxRect(x + 14 + i * 22, y + 50, 13, 25, INK);
      pxRect(x + 17 + i * 22, y + 53, 7, 19, PAPER);
      ditherRect(x + 18 + i * 22, y + 57, 5, 12, 2);
    }
    drawArt("wheat", x + w - 31, y + 39, 16, 32);
  }
}

function drawPriceSign(x, y) {
  pxRect(x, y, 49, 31, INK);
  pxRect(x + 3, y + 3, 43, 25, PAPER);
  pxText("BREAD", x + 24, y + 6, 5, INK, "center");
  pxText(`${sim.price.toFixed(0)} SILVER`, x + 24, y + 14, 8, INK, "center");
  pxRect(x + 23, y + 31, 3, 13, INK);
}

function drawWorld(time) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  pxRect(0, 0, w, h, PAPER);

  // Sky and distant industrial skyline.
  ditherRect(0, 0, w, 81, 4);
  pxRect(0, 73, w, 8, PAPER);
  pxRect(0, 80, w, 4, INK);
  const skyline = [
    [0, 46, 42, 35], [39, 57, 32, 24], [68, 39, 48, 42], [112, 52, 29, 29],
    [137, 31, 37, 50], [169, 48, 54, 33], [218, 43, 28, 38], [242, 55, 52, 26],
    [290, 36, 45, 45], [330, 49, 32, 32], [358, 41, 47, 40], [401, 54, 40, 27], [438, 45, 42, 36],
  ];
  skyline.forEach(([x, y, sw, sh], i) => {
    pxRect(x, y, sw, sh, INK);
    for (let wx = x + 5; wx < x + sw - 3; wx += 10) {
      for (let wy = y + 6; wy < y + sh - 3; wy += 9) pxRect(wx, wy, 3, 4, PAPER);
    }
    if (i % 3 === 0) pxRect(x + sw - 8, y - 15, 5, 15, INK);
  });
  drawArt("factory", 185, 25, 42, 38);
  drawArt("factory", 403, 31, 35, 32);

  drawCloud(32, 18, 1);
  drawCloud(378, 22, 1);

  // Street and perspective stones.
  pxRect(0, 81, w, h - 81, PAPER);
  ditherRect(0, 187, w, 83, 6);
  line(0, 184, w, 184, 2);
  for (let x = 0; x < w; x += 24) line(x, 185, x - 18, 270, 1);
  for (let y = 200; y < 270; y += 16) line(0, y, w, y, 1);

  // Buildings and a hand-drawn market stall.
  drawBuilding(16, 88, 126, 98, "bakery");
  drawBuilding(339, 96, 123, 90, "grain");
  drawArt("stall", 205, 105, 66, 62);

  // Alley.
  pxRect(274, 103, 48, 83, INK);
  ditherRect(278, 107, 40, 75, 3, true);
  pxText("ALLEY", 298, 112, 6, PAPER, "center");
  if (sim.blackMarket > 0) {
    const pulse = Math.floor(time / 180) % 2;
    pxRect(281, 132, 34, 26, pulse ? PAPER : INK);
    pxRect(284, 135, 28, 20, pulse ? INK : PAPER);
    pxText("7", 298, 139, 12, pulse ? PAPER : INK, "center");
    pxText("SILVER", 298, 151, 4, pulse ? PAPER : INK, "center");
  }

  // Bakery action.
  const bakerFrame = Math.floor(time / 280) % 2;
  if (sim.shutters < 0.65) {
    drawArt("baker", 78 + bakerFrame, 119, 45, 58);
  } else {
    drawPerson(102, 157, { apron: true, hat: true, dir: -1, frame: bakerFrame });
  }
  drawPriceSign(161, 137);

  // Smoke stops after production halt.
  if (sim.smoke > 0.02) {
    const smokeOffset = Math.floor(time / 220) % 8;
    for (let i = 0; i < 5; i += 1) {
      const sx = 125 + ((i * 7 + smokeOffset) % 12);
      const sy = 50 - i * 8 - smokeOffset;
      pxRect(sx, sy, 4 + (i % 2) * 3, 3, INK);
      if (i > 1) ditherRect(sx - 2, sy - 2, 8, 6, 2);
    }
  }

  // Ambient walkers and the growing queue.
  drawPerson(221 + Math.sin(time / 1100) * 8, 198, { frame: Math.floor(time / 300) % 2, bag: true });
  drawPerson(410 - (time / 90) % 210, 226, { dir: -1, frame: Math.floor(time / 250) % 2 });
  drawArt("worker", 390, 142, 33, 36);
  const q = Math.round(sim.queue);
  for (let i = 0; i < q; i += 1) {
    const row = Math.floor(i / 6);
    const col = i % 6;
    drawPerson(155 + col * 17 + row * 7, 190 + row * 28, {
      dir: -1,
      frame: (i + Math.floor(time / 450)) % 2,
      hat: i % 3 === 0,
      bag: i % 4 === 0,
    });
  }

  if (sim.blackMarket > 0) {
    drawPerson(286, 160, { pale: true, dir: 1, hat: true, bag: true, frame: 0 });
    drawPerson(304, 164, { pale: true, dir: -1, frame: 1 });
  }

  // World labels.
  pxRect(5, 89, 38, 12, INK);
  pxText("SHOP 01", 24, 92, 5, PAPER, "center");
  pxRect(348, 89, 43, 12, INK);
  pxText("SUPPLY 02", 369, 92, 5, PAPER, "center");

  // One-bit edge marks.
  for (let x = 6; x < w; x += 18) pxRect(x, 265, 7, 2, INK);
}

function animate(now) {
  if (sim.running) {
    sim.elapsed = now - sim.startedAt;
    const nextStep = steps.findIndex((step, index) => index > sim.step && sim.elapsed >= step.at);
    if (nextStep !== -1) applyStep(nextStep);

    if (sim.state === "price") {
      sim.price += (2 - sim.price) * 0.09;
      sim.queue += (3 - sim.queue) * 0.05;
    }
    if (sim.state === "halt") {
      sim.smoke += (0 - sim.smoke) * 0.08;
      sim.shutters += (0.45 - sim.shutters) * 0.07;
      sim.stock += (9 - sim.stock) * 0.045;
      sim.queue += (6 - sim.queue) * 0.05;
    }
    if (sim.state === "shortage") {
      sim.shutters += (1 - sim.shutters) * 0.08;
      sim.stock += (0 - sim.stock) * 0.11;
      sim.queue += (11 - sim.queue) * 0.06;
    }
    if (sim.state === "blackmarket" || sim.state === "done") {
      sim.blackMarket += (1 - sim.blackMarket) * 0.12;
      sim.queue += (8 - sim.queue) * 0.04;
    }

    updateMetrics();
  }

  drawWorld(now);
  requestAnimationFrame(animate);
}

function applyStep(index) {
  const step = steps[index];
  sim.step = index;
  sim.state = step.action;
  worldCaption.textContent = step.caption;
  worldPhase.textContent = step.phase;
  clockReadout.textContent = `DAY 01 · ${step.time}`;
  addEvent(step.time, step.event);

  if (step.action === "compile") {
    compiledRule.innerHTML = `
      <div><span>RULE</span><b>PRICE_CAP</b></div>
      <div><span>TARGET</span><b>BREAD</b></div>
      <div><span>LIMIT</span><b>2.0</b></div>`;
    systemStatus.textContent = "RULE COMPILED";
  }
  if (step.action === "price") {
    systemStatus.textContent = "INTERVENTION ACTIVE";
    showReticle(35, 34);
  }
  if (step.action === "halt") {
    systemStatus.textContent = "PRODUCTION WARNING";
    showReticle(15, 24);
  }
  if (step.action === "shortage") {
    systemStatus.textContent = "SHORTAGE DETECTED";
    showReticle(30, 57);
  }
  if (step.action === "blackmarket") {
    systemStatus.textContent = "UNPRICED EXCHANGE";
    showReticle(57, 35);
  }
  if (step.action === "done") {
    systemStatus.textContent = "TRACE COMPLETE";
    statusLamp.classList.remove("running");
    sim.running = false;
    runButton.textContent = "再次运行";
  }
}

function showReticle(leftPercent, topPercent) {
  focusReticle.style.left = `${leftPercent}%`;
  focusReticle.style.top = `${topPercent}%`;
  focusReticle.classList.remove("show");
  void focusReticle.offsetWidth;
  focusReticle.classList.add("show");
}

function addEvent(time, text) {
  const ghost = eventLog.querySelector(".ghost");
  if (ghost) ghost.remove();
  eventLog.querySelectorAll(".active").forEach((item) => item.classList.remove("active"));
  const li = document.createElement("li");
  li.className = "event active new";
  li.innerHTML = `<time>${time}</time><span>${text}</span>`;
  eventLog.append(li);
  eventLog.scrollTop = eventLog.scrollHeight;
}

function updateMetrics() {
  priceMetric.textContent = sim.price.toFixed(1);
  stockMetric.textContent = `${Math.max(0, Math.round(sim.stock))}`;
  queueMetric.textContent = `${Math.max(0, Math.round(sim.queue))}`;
}

function resetSimulation() {
  Object.assign(sim, {
    running: false,
    startedAt: 0,
    elapsed: 0,
    step: -1,
    state: "baseline",
    price: 4,
    stock: 24,
    queue: 0,
    smoke: 1,
    shutters: 0,
    blackMarket: 0,
  });
  compiledRule.innerHTML = `
    <div><span>RULE</span><b>WAITING_FOR_INPUT</b></div>
    <div><span>TARGET</span><b>—</b></div>
    <div><span>LIMIT</span><b>—</b></div>`;
  eventLog.innerHTML = `
    <li class="event active"><time>06:00</time><span>市场开门。面包师按成本 2.6 银币生产。</span></li>
    <li class="event ghost"><time>--:--</time><span>等待世界发生下一件事……</span></li>`;
  worldCaption.textContent = "06:00 / 炉火点燃，第一批面包正在出炉。";
  worldPhase.textContent = "BASELINE";
  clockReadout.textContent = "DAY 01 · 06:00";
  systemStatus.textContent = "MARKET OPEN";
  statusLamp.classList.remove("running");
  runButton.innerHTML = "执行法令 <kbd>ENTER</kbd>";
  updateMetrics();
}

function runSimulation() {
  if (sim.running) return;
  resetSimulation();
  sim.running = true;
  sim.startedAt = performance.now();
  statusLamp.classList.add("running");
  systemStatus.textContent = "PARSING ORDINANCE";
  runButton.textContent = "世界运行中……";
}

runButton.addEventListener("click", runSimulation);
resetButton.addEventListener("click", resetSimulation);
policyInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    runSimulation();
  }
});

expandLedger.addEventListener("click", (event) => {
  event.stopPropagation();
  ledgerWindow.classList.toggle("expanded");
  expandLedger.textContent = ledgerWindow.classList.contains("expanded") ? "↙" : "↗";
  ledgerWindow.classList.add("active-window");
});

// Minimal draggable windows. State is deliberately in-memory only.
document.querySelectorAll(".pixel-window").forEach((windowEl) => {
  const handle = windowEl.querySelector(".drag-handle");
  let drag = null;

  windowEl.addEventListener("pointerdown", () => {
    document.querySelectorAll(".pixel-window").forEach((el) => el.classList.remove("active-window"));
    windowEl.classList.add("active-window");
  });

  handle.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    const rect = windowEl.getBoundingClientRect();
    const parentRect = windowEl.parentElement.getBoundingClientRect();
    drag = {
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      parentLeft: parentRect.left,
      parentTop: parentRect.top,
    };
    windowEl.style.right = "auto";
    windowEl.style.bottom = "auto";
    windowEl.style.width = `${rect.width}px`;
    windowEl.style.height = `${rect.height}px`;
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const maxLeft = windowEl.parentElement.clientWidth - windowEl.offsetWidth - 4;
    const maxTop = windowEl.parentElement.clientHeight - windowEl.offsetHeight - 4;
    const left = Math.min(maxLeft, Math.max(4, event.clientX - drag.parentLeft - drag.dx));
    const top = Math.min(maxTop, Math.max(4, event.clientY - drag.parentTop - drag.dy));
    windowEl.style.left = `${left}px`;
    windowEl.style.top = `${top}px`;
  });

  handle.addEventListener("pointerup", (event) => {
    drag = null;
    handle.releasePointerCapture(event.pointerId);
  });
});

// Resizable ledger corner.
const resizeCorner = document.querySelector(".resize-corner");
let resize = null;
resizeCorner.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  const rect = ledgerWindow.getBoundingClientRect();
  resize = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };
  resizeCorner.setPointerCapture(event.pointerId);
});
resizeCorner.addEventListener("pointermove", (event) => {
  if (!resize) return;
  ledgerWindow.style.width = `${Math.max(360, resize.width + event.clientX - resize.x)}px`;
  ledgerWindow.style.height = `${Math.max(200, resize.height + event.clientY - resize.y)}px`;
});
resizeCorner.addEventListener("pointerup", (event) => {
  resize = null;
  resizeCorner.releasePointerCapture(event.pointerId);
});

resetSimulation();
requestAnimationFrame(animate);
