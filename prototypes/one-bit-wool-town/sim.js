/* PROTOTYPE ONLY — deterministic wool-town tick simulation.
 *
 * Pure state machine: no DOM, no Date.now, no Math.random.
 * Same seed + same action sequence => same event log (exact replay),
 * mirroring the product kernel contract in product/src/modules/world/kernel.
 *
 * Baseline mirrors WOOL_TOWN_BASELINE_METRICS (wool-town-v1):
 * output 12 / stock 8 (原毛4+纱线3+粗呢1) / reachable_orders 2 / cash 24.
 */

export const TICK_MS = 320;

const INTERVALS = {
  shepherd: 6, // ticks per 原毛
  spinner: 4, // 2 原毛 -> 1 纱线
  weaver: 5, // 1 纱线 -> 1 粗呢
  weaverRush: 3,
  merchant: 7, // 1 粗呢 -> cash
  marketRegen: 18, // recover one spent order
};

const RUSH_TICKS = 15;
const REST_TICKS = 10;
const RUSH_COOLDOWN = 45;
const EXPAND_COST = 8;

export function createWorld(seed = 42) {
  return {
    seed,
    tick: 0,
    day: 1,
    minuteOfDay: 8 * 60,
    revision: 0,
    inv: { wool: 4, yarn: 3, cloth: 1 },
    cash: 24,
    output: 12,
    orderCap: 2,
    ordersUsed: 0,
    price: 6,
    timers: { shepherd: 0, spinner: 0, weaver: 0, merchant: 0, market: 0 },
    rushTicks: 0,
    restTicks: 0,
    cooldownTicks: 0,
  };
}

export function metricsOf(w) {
  return {
    output: w.output + (w.rushTicks > 0 ? 4 : 0),
    stock: w.inv.wool + w.inv.yarn + w.inv.cloth,
    reachable_orders: w.orderCap - w.ordersUsed,
    cash: w.cash,
  };
}

export function clockOf(w) {
  const h = String(Math.floor(w.minuteOfDay / 60) % 24).padStart(2, "0");
  const m = String(w.minuteOfDay % 60).padStart(2, "0");
  return `DAY ${String(w.day).padStart(2, "0")} · ${h}:${m}`;
}

function push(events, w, text, kind = "world") {
  events.push({ tick: w.tick, clock: clockOf(w), text, kind });
}

export function stepWorld(w) {
  const events = [];
  w.tick += 1;
  w.minuteOfDay += 15;
  if (w.minuteOfDay >= 24 * 60) {
    w.minuteOfDay -= 24 * 60;
    w.day += 1;
  }

  if (w.cooldownTicks > 0) w.cooldownTicks -= 1;
  if (w.rushTicks > 0) {
    w.rushTicks -= 1;
    if (w.rushTicks === 0) {
      w.restTicks = REST_TICKS;
      push(events, w, "赶单结束，织工疲惫，织机停工休整。", "world");
    }
  } else if (w.restTicks > 0) {
    w.restTicks -= 1;
    if (w.restTicks === 0) push(events, w, "织工休整完毕，回到织机。", "world");
  }

  w.timers.shepherd += 1;
  if (w.timers.shepherd >= INTERVALS.shepherd) {
    w.timers.shepherd = 0;
    w.inv.wool += 1;
    push(events, w, "牧羊人剪下 1 份原毛。", "world");
    events[events.length - 1].token = "wool";
  }

  w.timers.spinner += 1;
  if (w.timers.spinner >= INTERVALS.spinner) {
    w.timers.spinner = 0;
    if (w.inv.wool >= 2) {
      w.inv.wool -= 2;
      w.inv.yarn += 1;
      push(events, w, "纺纱工把 2 份原毛纺成 1 绞纱线。", "world");
      events[events.length - 1].token = "yarn";
    }
  }

  w.timers.weaver += 1;
  const weaverInterval = w.rushTicks > 0 ? INTERVALS.weaverRush : INTERVALS.weaver;
  if (w.restTicks > 0) {
    w.timers.weaver = 0;
  } else if (w.timers.weaver >= weaverInterval) {
    w.timers.weaver = 0;
    if (w.inv.yarn >= 1) {
      w.inv.yarn -= 1;
      w.inv.cloth += 1;
      push(events, w, "织工把 1 绞纱线织成 1 匹粗呢。", "world");
      events[events.length - 1].token = "cloth";
    }
  }

  w.timers.merchant += 1;
  if (w.timers.merchant >= INTERVALS.merchant) {
    w.timers.merchant = 0;
    if (w.inv.cloth >= 1 && w.ordersUsed < w.orderCap) {
      w.inv.cloth -= 1;
      w.ordersUsed += 1;
      w.cash += w.price;
      push(events, w, `商人售出 1 匹粗呢，进账 ${w.price} 银币。`, "world");
      events[events.length - 1].token = "coin";
    }
  }

  w.timers.market += 1;
  if (w.timers.market >= INTERVALS.market) {
    w.timers.market = 0;
    if (w.ordersUsed > 0) {
      w.ordersUsed -= 1;
      push(events, w, "新的订单从邻镇抵达。", "world");
    }
  }

  return events;
}

export function act(w, actionId) {
  const events = [];
  if (actionId === "expand_market") {
    if (w.cash < EXPAND_COST) {
      push(events, w, `（法令未执行：现金不足 ${EXPAND_COST} 银币，世界未改变。）`, "denied");
      return { ok: false, events };
    }
    w.cash -= EXPAND_COST;
    w.orderCap += 2;
    w.output += 5;
    w.price += 1;
    w.revision += 1;
    push(events, w, "你派出商人开拓更大的市集。", "action");
    push(
      events,
      w,
      `市集开阔了：可触达订单上限 +2，供给预期 +5，粗呢售价涨到 ${w.price} 银币。`,
      "action",
    );
    return { ok: true, events };
  }
  if (actionId === "rush_weaver") {
    if (w.cooldownTicks > 0 || w.rushTicks > 0 || w.restTicks > 0) {
      push(events, w, "（法令未执行：织工还没缓过来，世界未改变。）", "denied");
      return { ok: false, events };
    }
    w.rushTicks = RUSH_TICKS;
    w.cooldownTicks = RUSH_COOLDOWN;
    w.revision += 1;
    push(events, w, "你让织工赶单：织机全速运转。", "action");
    push(events, w, "二阶后果已写入规则：赶单结束后织工必须停工休整。", "action");
    return { ok: true, events };
  }
  push(events, w, "（未知法令，世界未改变。）", "denied");
  return { ok: false, events };
}

export function rushState(w) {
  if (w.rushTicks > 0) return "rushing";
  if (w.restTicks > 0) return "resting";
  return "steady";
}

export { EXPAND_COST, RUSH_TICKS, REST_TICKS };
