import { describe, expect, it } from "vitest";
import {
  CANONICAL_ACTOR_ORDER,
  canonicalize,
  compileWorldMetricsToEventMetrics,
  createWoolTownBaseline,
  decide,
  deepEqualState,
  evolve,
  KERNEL_COMPILED_METRIC_KEYS,
  metricsEqual,
  recomputePredicate,
  selectLocalState,
  validateKernelEventSpec,
  validateObservation,
  WOOL_TOWN_BASELINE_METRICS,
  WOOL_TOWN_EXPANDED_METRICS,
  WOOL_TOWN_RULESET_ID,
  woolTownEnv,
  type WorldCommand,
  type WorldState,
} from "@/modules/world";
import { sha256Canonical } from "./hash-adapter";

function baseline(): WorldState {
  return createWoolTownBaseline({
    experience_id: "exp_wool_1",
    world_id: "world_wool_1",
    graph_revision: 1,
    seed: 42,
  });
}

function cmd(
  action: string,
  state: WorldState,
  overrides: Partial<WorldCommand> = {},
): WorldCommand {
  return {
    action,
    experience_id: state.experience_id,
    world_id: state.world_id,
    graph_revision: state.graph_revision,
    expected_world_revision: state.world_revision,
    ruleset_id: state.ruleset_id,
    ...overrides,
  };
}

describe("T008 WorldKernel wool-town", () => {
  it("baseline fixture metrics 12/8/2/24", () => {
    const s = baseline();
    expect(s.metrics).toEqual(WOOL_TOWN_BASELINE_METRICS);
    expect(s.phase).toBe("playable");
    expect(s.ruleset_id).toBe(WOOL_TOWN_RULESET_ID);
  });

  it("deepen on small market: CHARACTER_REFUSAL, metrics unchanged, revision +1", () => {
    const state = baseline();
    const frozen = structuredClone(state);
    const env = woolTownEnv(42);
    const receipt = decide(state, cmd("deepen_specialization", state), env);

    expect(receipt.ok).toBe(true);
    expect(receipt.code).toBe("CHARACTER_REFUSAL");
    expect(receipt.events).toHaveLength(1);
    expect(receipt.observations).toHaveLength(1);
    expect(receipt.events[0]!.event_kind).toBe("character_refusal");
    expect(receipt.events[0]!.actor_id).toBe("weaver");
    expect(receipt.events[0]!.metrics).toEqual({
      supply: 12,
      inventory: 8,
      demand: 2,
      cash: 24,
    });
    expect(metricsEqual(receipt.next_state.metrics, WOOL_TOWN_BASELINE_METRICS)).toBe(
      true,
    );
    expect(receipt.next_state.world_revision).toBe(1);
    expect(deepEqualState(state, frozen)).toBe(true);
  });

  it("expand_market: 12/8/2/24→17/11/4/28; order merchant→…→weaver", () => {
    const state = baseline();
    const frozen = structuredClone(state);
    const receipt = decide(state, cmd("expand_market", state), woolTownEnv(42));

    expect(receipt.ok).toBe(true);
    expect(receipt.code).toBe("OK");
    expect(receipt.next_state.metrics).toEqual(WOOL_TOWN_EXPANDED_METRICS);
    expect(receipt.next_state.world_revision).toBe(1);
    expect(receipt.events).toHaveLength(4);

    const order = ["merchant", "shepherd", "spinner", "weaver"] as const;
    for (let i = 0; i < 4; i++) {
      expect(receipt.events[i]!.actor_id).toBe(order[i]);
      expect(receipt.events[i]!.causation_index).toBe(i);
      expect(receipt.observations[i]!.actor_id).toBe(order[i]);
      // compiled T003 metrics
      expect(receipt.events[i]!.metrics).toEqual({
        supply: 17,
        inventory: 11,
        demand: 4,
        cash: 28,
      });
    }

    for (const obs of receipt.observations) {
      const recomputed = recomputePredicate(obs.predicate_id, obs.local_state);
      expect(recomputed.evaluated).toBe(obs.evaluated);
      expect(recomputed.action).toBe(obs.action);
    }
    expect(deepEqualState(state, frozen)).toBe(true);
  });

  it("guard matrix typed failures", () => {
    const state = baseline();
    const env = woolTownEnv(42);
    const cases: Array<{ name: string; command: WorldCommand; code: string; input?: WorldState }> =
      [
        {
          name: "not ready",
          command: cmd("expand_market", state),
          code: "WORLD_NOT_READY",
          input: { ...state, phase: "closed" },
        },
        {
          name: "identity",
          command: cmd("expand_market", state, { world_id: "other" }),
          code: "WORLD_IDENTITY_MISMATCH",
        },
        {
          name: "graph",
          command: cmd("expand_market", state, { graph_revision: 99 }),
          code: "GRAPH_REVISION_MISMATCH",
        },
        {
          name: "revision",
          command: cmd("expand_market", state, { expected_world_revision: 7 }),
          code: "EXPECTED_WORLD_REVISION_MISMATCH",
        },
        {
          name: "ruleset",
          command: cmd("expand_market", state, { ruleset_id: "other-v1" }),
          code: "RULESET_MISMATCH",
        },
        {
          name: "unknown action",
          command: cmd("constrain_market", state),
          code: "ACTION_UNSUPPORTED",
        },
      ];

    for (const c of cases) {
      const input = c.input ?? state;
      const frozen = structuredClone(input);
      const r = decide(input, c.command, env);
      expect({ name: c.name, ok: r.ok, code: r.code }).toEqual({
        name: c.name,
        ok: false,
        code: c.code,
      });
      expect(r.events).toEqual([]);
      expect(r.observations).toEqual([]);
      expect(deepEqualState(r.next_state, input)).toBe(true);
      expect(deepEqualState(input, frozen)).toBe(true);
    }
  });

  it("replay hash stable", () => {
    const state = baseline();
    const env = woolTownEnv(42);
    const command = cmd("expand_market", state);
    const a = decide(state, command, env);
    const b = decide(state, command, env);
    expect(canonicalize(a.next_state)).toBe(canonicalize(b.next_state));
    expect(sha256Canonical({ state: a.next_state, events: a.events })).toBe(
      sha256Canonical({ state: b.next_state, events: b.events }),
    );
  });

  it("KernelEventSpec schema strict", () => {
    expect(
      validateKernelEventSpec({
        event_kind: "character_refusal",
        actor_id: "weaver",
        summary: "ok",
        metrics: { supply: 1, inventory: 2, demand: 3, cash: 4 },
        causation_index: 0,
      }).ok,
    ).toBe(true);

    // raw kernel metric keys not allowed
    expect(
      validateKernelEventSpec({
        event_kind: "character_refusal",
        actor_id: "weaver",
        summary: "ok",
        metrics: { output: 1, stock: 2, reachable_orders: 3, cash: 4 },
        causation_index: 0,
      }).ok,
    ).toBe(false);

    // fractional causation_index
    expect(
      validateKernelEventSpec({
        event_kind: "character_observation",
        actor_id: "merchant",
        summary: "x",
        metrics: { supply: 1, inventory: 2, demand: 3, cash: 4 },
        causation_index: 0.5,
      }).ok,
    ).toBe(false);

    // evil event_kind
    expect(
      validateKernelEventSpec({
        event_kind: "evil_kind",
        actor_id: "weaver",
        summary: "x",
        metrics: { supply: 1, inventory: 2, demand: 3, cash: 4 },
        causation_index: 0,
      }).ok,
    ).toBe(false);

    // evil actor
    expect(
      validateKernelEventSpec({
        event_kind: "character_refusal",
        actor_id: "dragon",
        summary: "x",
        metrics: { supply: 1, inventory: 2, demand: 3, cash: 4 },
        causation_index: 0,
      }).ok,
    ).toBe(false);
  });

  it("weaver local slice is minimal", () => {
    const local = selectLocalState("weaver", baseline(), woolTownEnv().ruleset);
    expect(local).toEqual({
      actor_id: "weaver",
      reachable_orders: 2,
      minimum_orders_for_next_depth: 3,
      outputs_pending: 0,
    });
    expect("output" in local).toBe(false);
    expect("cash" in local).toBe(false);
    expect("experience_id" in local).toBe(false);
  });
});

describe("T008 F42/F43/F44 rework", () => {
  it("F42: null/malformed state|command|env never throw; typed fail", () => {
    const state = baseline();
    const env = woolTownEnv(42);
    const goodCmd = cmd("expand_market", state);

    const probes: Array<{ name: string; args: [unknown, unknown, unknown]; code: string }> =
      [
        { name: "null state", args: [null, goodCmd, env], code: "INVALID_STATE" },
        { name: "undef state", args: [undefined, goodCmd, env], code: "INVALID_STATE" },
        { name: "string state", args: ["nope", goodCmd, env], code: "INVALID_STATE" },
        { name: "null command", args: [state, null, env], code: "INVALID_COMMAND" },
        { name: "null env", args: [state, goodCmd, null], code: "INVALID_ENV" },
        {
          name: "NaN metrics",
          args: [
            { ...state, metrics: { ...state.metrics, cash: Number.NaN } },
            goodCmd,
            env,
          ],
          code: "INVALID_STATE",
        },
        {
          name: "empty identity",
          args: [{ ...state, experience_id: "" }, goodCmd, env],
          code: "INVALID_STATE",
        },
        {
          name: "decimal revision",
          args: [{ ...state, world_revision: 1.5 }, goodCmd, env],
          code: "INVALID_STATE",
        },
        {
          name: "negative graph_revision",
          args: [{ ...state, graph_revision: -1 }, goodCmd, env],
          code: "INVALID_STATE",
        },
        {
          name: "unknown root field",
          args: [{ ...state, evil: true }, goodCmd, env],
          code: "INVALID_STATE",
        },
        {
          name: "seed mismatch",
          args: [state, goodCmd, { ...env, seed: 999 }],
          code: "SEED_MISMATCH",
        },
      ];

    for (const p of probes) {
      let threw = false;
      let r;
      try {
        r = decide(p.args[0], p.args[1], p.args[2]);
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
      expect({ name: p.name, ok: r!.ok, code: r!.code }).toEqual({
        name: p.name,
        ok: false,
        code: p.code,
      });
      expect(r!.events).toEqual([]);
    }
  });

  it("F43: ruleset same id with tampered delta/actor order fails; frozen not polluted", () => {
    const state = baseline();
    const good = woolTownEnv(42);

    // tampered delta
    const evilDelta = decide(
      state,
      cmd("expand_market", state),
      {
        seed: 42,
        ruleset: {
          ...good.ruleset,
          ruleset_id: "wool-town-v1",
          expand_delta: { output: 999, stock: 999, reachable_orders: 999, cash: 999 },
          actor_ids: [...good.ruleset.actor_ids],
        },
      },
    );
    expect(evilDelta.ok).toBe(false);
    expect(evilDelta.code).toBe("RULESET_MISMATCH");

    // reordered actors
    const evilOrder = decide(
      state,
      cmd("expand_market", state),
      {
        seed: 42,
        ruleset: {
          ruleset_id: "wool-town-v1",
          weaver_minimum_orders_for_next_depth: 3,
          weaver_outputs_pending: 0,
          expand_delta: { output: 5, stock: 3, reachable_orders: 2, cash: 4 },
          actor_ids: ["weaver", "merchant", "shepherd", "spinner"],
        },
      },
    );
    expect(evilOrder.ok).toBe(false);
    expect(evilOrder.code).toBe("RULESET_MISMATCH");

    // missing actor
    const missing = decide(
      state,
      cmd("expand_market", state),
      {
        seed: 42,
        ruleset: {
          ruleset_id: "wool-town-v1",
          weaver_minimum_orders_for_next_depth: 3,
          weaver_outputs_pending: 0,
          expand_delta: { output: 5, stock: 3, reachable_orders: 2, cash: 4 },
          actor_ids: ["merchant", "shepherd", "spinner"],
        },
      },
    );
    expect(missing.ok).toBe(false);

    // shared env pollution attempt: mutate expand_delta if not frozen would change
    // after evil call, good still works with correct metrics
    const ok = decide(state, cmd("expand_market", state), woolTownEnv(42));
    expect(ok.ok).toBe(true);
    expect(ok.next_state.metrics).toEqual(WOOL_TOWN_EXPANDED_METRICS);
  });

  it("F44: evolve rejects evil event / NaN patch; compile maps to T003 keys", () => {
    const state = baseline();
    const compiled = compileWorldMetricsToEventMetrics(state.metrics);
    expect(compiled).toEqual({
      supply: 12,
      inventory: 8,
      demand: 2,
      cash: 24,
    });
    // no raw keys
    expect("output" in compiled).toBe(false);

    const evil = evolve(
      state,
      [
        {
          event_kind: "character_refusal" as const,
          actor_id: "dragon" as unknown as "weaver",
          summary: "x",
          metrics: compiled,
          causation_index: 0,
        },
      ],
      null,
    );
    expect(evil.ok).toBe(false);
    if (!evil.ok) {
      expect(evil.code).toBe("KERNEL_EVENT_SPEC_INVALID");
      expect(evil.state.world_revision).toBe(0);
    }

    const nanPatch = evolve(state, [], {
      output: Number.NaN,
      stock: 1,
      reachable_orders: 1,
      cash: 1,
    });
    expect(nanPatch.ok).toBe(false);

    const goodEvent = {
      event_kind: "character_refusal" as const,
      actor_id: "weaver" as const,
      summary: "refuse",
      metrics: compiled,
      causation_index: 0,
    };
    expect(validateKernelEventSpec(goodEvent).ok).toBe(true);
    const good = evolve(state, [goodEvent], null);
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.state.world_revision).toBe(1);
    }
  });

  it("F44: decide never emits event that fails validateKernelEventSpec", () => {
    const state = baseline();
    for (const action of ["deepen_specialization", "expand_market"] as const) {
      const r = decide(state, cmd(action, state), woolTownEnv(42));
      expect(r.ok).toBe(true);
      for (const e of r.events) {
        expect(validateKernelEventSpec(e).ok).toBe(true);
      }
    }
  });

  it("round2: evolve(null/[]) never throws; typed INVALID_STATE", () => {
    for (const bad of [null, undefined, "x", 1, {}]) {
      let threw = false;
      let r;
      try {
        r = evolve(bad, []);
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
      expect(r!.ok).toBe(false);
      if (!r!.ok) {
        expect(r!.code).toBe("INVALID_STATE");
        expect(r!.state.phase).toBe("closed");
      }
    }
    // empty events on valid state is ok no-op
    const ok = evolve(baseline(), []);
    expect(ok.ok).toBe(true);
  });

  it("round2: ruleset unknown root field rejected", () => {
    const state = baseline();
    const r = decide(state, cmd("expand_market", state), {
      seed: 42,
      ruleset: {
        ruleset_id: "wool-town-v1",
        weaver_minimum_orders_for_next_depth: 3,
        weaver_outputs_pending: 0,
        expand_delta: { output: 5, stock: 3, reachable_orders: 2, cash: 4 },
        actor_ids: ["merchant", "shepherd", "spinner", "weaver"],
        evil_extra: true,
      } as never,
    });
    expect(r.ok).toBe(false);
    expect(["INVALID_ENV", "RULESET_MISMATCH"]).toContain(r.code);
  });

  it("round2: observation local_state NaN/extra field fail; freeze constants", () => {
    expect(
      validateObservation({
        actor_id: "weaver",
        predicate_id: "weaver.deepen_gate",
        evaluated: false,
        local_state: {
          actor_id: "weaver",
          reachable_orders: Number.NaN,
          minimum_orders_for_next_depth: 3,
          outputs_pending: 0,
        },
        action: "refuse",
        reason_code: "CHARACTER_REFUSAL",
        causation_index: 0,
      }).ok,
    ).toBe(false);
    expect(
      validateObservation({
        actor_id: "weaver",
        predicate_id: "weaver.deepen_gate",
        evaluated: false,
        local_state: {
          actor_id: "weaver",
          reachable_orders: 2,
          minimum_orders_for_next_depth: 3,
          outputs_pending: 0,
          cash: 99,
        },
        action: "refuse",
        reason_code: "CHARACTER_REFUSAL",
        causation_index: 0,
      }).ok,
    ).toBe(false);

    expect(Object.isFrozen(CANONICAL_ACTOR_ORDER)).toBe(true);
    expect(Object.isFrozen(KERNEL_COMPILED_METRIC_KEYS)).toBe(true);
  });

  it("round2: unsafe integer rejected; checkGuards not public; causation continuous", async () => {
    const state = baseline();
    const unsafe = decide(
      { ...state, seed: Number.MAX_SAFE_INTEGER + 1 },
      cmd("expand_market", state),
      woolTownEnv(42),
    );
    expect(unsafe.ok).toBe(false);
    expect(unsafe.code).toBe("INVALID_STATE");

    const barrel = await import("@/modules/world");
    expect(
      "checkGuards" in barrel && (barrel as { checkGuards?: unknown }).checkGuards,
    ).toBeFalsy();

    const r = decide(state, cmd("expand_market", state), woolTownEnv(42));
    expect(r.ok).toBe(true);
    const idxs = r.events.map((e) => e.causation_index);
    expect(idxs).toEqual([0, 1, 2, 3]);
    // no shared metrics alias across events
    r.events[0]!.metrics.cash = 999;
    expect(r.events[1]!.metrics.cash).toBe(28);
  });

  it("round2: prototype inheritance bypass rejected", () => {
    const proto = Object.create({ experience_id: "exp", world_id: "w" });
    Object.assign(proto, {
      experience_id: "exp_wool_1",
      world_id: "world_wool_1",
      graph_revision: 1,
      world_revision: 0,
      ruleset_id: "wool-town-v1",
      seed: 42,
      phase: "playable",
      metrics: { output: 12, stock: 8, reachable_orders: 2, cash: 24 },
    });
    // If created with non-Object prototype, isPlainObject fails
    const withEvilProto = Object.assign(
      Object.create({ evil: true }),
      baseline(),
    );
    const r = decide(
      withEvilProto,
      cmd("expand_market", baseline()),
      woolTownEnv(42),
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe("INVALID_STATE");
  });
});
