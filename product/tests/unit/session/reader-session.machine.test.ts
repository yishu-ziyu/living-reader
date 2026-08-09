import { describe, expect, it } from "vitest";
import {
  createSessionActor,
  getSessionState,
  getSessionContext,
  safeAttemptTransition,
  sessionReplayHash,
  hashFromReceiptsAndActor,
  type SessionActor,
} from "@/modules/session/reader-session.test-harness";
import type { ReaderSessionEvent, SessionTransitionReceipt } from "@/modules/session";
import { worldSlotStateFromSession } from "@/modules/session";
import * as productionBarrel from "@/modules/session";

function seedSources(
  actor: SessionActor,
  exp = "exp_t004",
  ids = ["smith.b1.c1.division", "smith.b1.c3.market_extent"],
) {
  return safeAttemptTransition(actor, {
    type: "SET_SOURCE_SNAPSHOT",
    experience_id: exp,
    source_snapshot_ids: ids,
  });
}

function reviewCommitGate(actor: SessionActor, rev = 2) {
  safeAttemptTransition(actor, { type: "ENTER_REVIEWING_GRAPH" });
  safeAttemptTransition(actor, {
    type: "RELATION_REVIEWED",
    relation_id: "rel_1",
    basis_revision: 0,
  });
  safeAttemptTransition(actor, {
    type: "GRAPH_COMMITTED",
    graph_revision: rev,
    accepted_relation_ids: ["rel_1"],
  });
  safeAttemptTransition(actor, {
    type: "PLAYABILITY_PASSED",
    graph_revision: rev,
  });
}

function openWorldHappyPath(actor: SessionActor) {
  seedSources(actor);
  reviewCommitGate(actor, 2);
  const open = safeAttemptTransition(actor, {
    type: "WORLD_OPEN_REQUESTED",
    graph_revision: 2,
  });
  expect(open.accepted).toBe(true);
  expect(getSessionState(actor)).toBe("active.preparing_world");
  const ctx = getSessionContext(actor);
  const ready = safeAttemptTransition(actor, {
    type: "WORLD_READY",
    correlation_id: ctx.correlation_id!,
    graph_revision: 2,
    world_id: "world_1",
    world_revision: 1,
    effect_generation: ctx.effect_generation,
  });
  expect(ready.accepted).toBe(true);
  expect(getSessionState(actor)).toBe("active.playable");
}

function assertSourceSwitchSafe(
  actor: SessionActor,
  oldExp: string,
  newExp: string,
) {
  const r = safeAttemptTransition(actor, {
    type: "SET_SOURCE_SNAPSHOT",
    experience_id: newExp,
    source_snapshot_ids: ["new.source.a"],
  });
  expect(r.accepted).toBe(true);
  expect(getSessionState(actor)).toBe("active.reading");
  expect(worldSlotStateFromSession(getSessionState(actor))).toBe("closed");
  const ctx = getSessionContext(actor);
  expect(ctx.experience_id).toBe(newExp);
  expect(ctx.world_id).toBeNull();
  expect(ctx.graph_committed).toBe(false);
  expect(ctx.relation_reviewed).toBe(false);
  expect(ctx.correlation_id).toBeNull();
  const cancel = ctx.pending_effects.find((e) => e.kind === "cancel_all");
  expect(cancel).toBeDefined();
  if (cancel && cancel.kind === "cancel_all") {
    expect(cancel.experience_id).toBe(oldExp);
  }
}

describe("T004 ReaderSession machine", () => {
  it("starts in active.reading", () => {
    const actor = createSessionActor();
    expect(getSessionState(actor)).toBe("active.reading");
  });

  it("START_VOICE without snapshot → SOURCE_NOT_READY", () => {
    const actor = createSessionActor();
    const r = safeAttemptTransition(actor, { type: "START_VOICE" });
    expect(r.accepted).toBe(false);
    expect(r.reason_code).toBe("SOURCE_NOT_READY");
  });

  it("START_VOICE with snapshot → capturing_voice", () => {
    const actor = createSessionActor();
    seedSources(actor);
    const r = safeAttemptTransition(actor, { type: "START_VOICE" });
    expect(r.accepted).toBe(true);
    expect(getSessionState(actor)).toBe("active.capturing_voice");
  });

  it("WORLD_OPEN without review/commit/gate rejected", () => {
    const actor = createSessionActor();
    seedSources(actor);
    expect(
      safeAttemptTransition(actor, {
        type: "WORLD_OPEN_REQUESTED",
        graph_revision: 1,
      }).reason_code,
    ).toBe("RELATION_NOT_REVIEWED");

    safeAttemptTransition(actor, {
      type: "RELATION_REVIEWED",
      relation_id: "r1",
      basis_revision: 0,
    });
    expect(
      safeAttemptTransition(actor, {
        type: "WORLD_OPEN_REQUESTED",
        graph_revision: 1,
      }).reason_code,
    ).toBe("GRAPH_NOT_COMMITTED");
  });

  it("F27: GRAPH_COMMITTED before RELATION_REVIEWED → CHRONOLOGY_VIOLATION", () => {
    const actor = createSessionActor();
    seedSources(actor);
    const r = safeAttemptTransition(actor, {
      type: "GRAPH_COMMITTED",
      graph_revision: 2,
      accepted_relation_ids: ["rel_x"],
    });
    expect(r.accepted).toBe(false);
    expect(r.reason_code).toBe("CHRONOLOGY_VIOLATION");
  });

  it("F27: GRAPH_COMMITTED without accepted relation id → RELATION_BASIS_MISMATCH", () => {
    const actor = createSessionActor();
    seedSources(actor);
    safeAttemptTransition(actor, {
      type: "RELATION_REVIEWED",
      relation_id: "rel_1",
      basis_revision: 0,
    });
    const r = safeAttemptTransition(actor, {
      type: "GRAPH_COMMITTED",
      graph_revision: 2,
      accepted_relation_ids: ["other"],
    });
    expect(r.accepted).toBe(false);
    expect(r.reason_code).toBe("RELATION_BASIS_MISMATCH");
  });

  it("F27: PLAYABILITY before commit → CHRONOLOGY_VIOLATION", () => {
    const actor = createSessionActor();
    seedSources(actor);
    safeAttemptTransition(actor, {
      type: "RELATION_REVIEWED",
      relation_id: "rel_1",
      basis_revision: 0,
    });
    const r = safeAttemptTransition(actor, {
      type: "PLAYABILITY_PASSED",
      graph_revision: 2,
    });
    expect(r.accepted).toBe(false);
    expect(r.reason_code).toBe("CHRONOLOGY_VIOLATION");
  });

  it("F27: SET_SOURCE_SNAPSHOT clears derived graph and bumps generation", () => {
    const actor = createSessionActor();
    seedSources(actor);
    reviewCommitGate(actor, 2);
    expect(getSessionContext(actor).graph_committed).toBe(true);
    const genBefore = getSessionContext(actor).effect_generation;
    const r = seedSources(actor, "exp_other", ["other.source"]);
    expect(r.accepted).toBe(true);
    const ctx = getSessionContext(actor);
    expect(ctx.graph_committed).toBe(false);
    expect(ctx.relation_reviewed).toBe(false);
    expect(ctx.world_id).toBeNull();
    expect(ctx.effect_generation).toBeGreaterThan(genBefore);
    expect(getSessionState(actor)).toBe("active.reading");
  });

  it("happy path reviewing → preparing → playable", () => {
    const actor = createSessionActor();
    openWorldHappyPath(actor);
  });

  it("stale WORLD_READY → STALE_COMPLETION", () => {
    const actor = createSessionActor();
    seedSources(actor);
    reviewCommitGate(actor, 2);
    safeAttemptTransition(actor, {
      type: "WORLD_OPEN_REQUESTED",
      graph_revision: 2,
    });
    const stale = safeAttemptTransition(actor, {
      type: "WORLD_READY",
      correlation_id: "wrong",
      graph_revision: 2,
      world_id: "w",
      world_revision: 1,
      effect_generation: 0,
    });
    expect(stale.accepted).toBe(false);
    expect(stale.reason_code).toBe("STALE_COMPLETION");
    expect(getSessionState(actor)).toBe("active.preparing_world");
  });

  it("F26: STOP→RESUME→new START→old VOICE_FINAL = STALE, stay capturing", () => {
    const actor = createSessionActor();
    seedSources(actor);
    safeAttemptTransition(actor, { type: "START_VOICE" });
    const first = getSessionContext(actor);
    const oldCorr = first.correlation_id!;
    const oldGen = first.effect_generation;
    safeAttemptTransition(actor, { type: "STOP" });
    expect(getSessionState(actor)).toBe("paused");
    safeAttemptTransition(actor, { type: "RESUME" });
    expect(getSessionState(actor)).toBe("active.reading");
    safeAttemptTransition(actor, { type: "START_VOICE" });
    expect(getSessionState(actor)).toBe("active.capturing_voice");
    const late = safeAttemptTransition(actor, {
      type: "VOICE_FINAL",
      correlation_id: oldCorr,
      effect_generation: oldGen,
    });
    expect(late.accepted).toBe(false);
    expect(late.reason_code).toBe("STALE_COMPLETION");
    expect(getSessionState(actor)).toBe("active.capturing_voice");
  });

  it("F26: STOP→RESUME playable→old EVIDENCE_READY = STALE", () => {
    const actor = createSessionActor();
    openWorldHappyPath(actor);
    const ctx = getSessionContext(actor);
    const corr = ctx.correlation_id!;
    const gen = ctx.effect_generation;
    safeAttemptTransition(actor, { type: "STOP" });
    safeAttemptTransition(actor, { type: "RESUME" });
    expect(getSessionState(actor)).toBe("active.playable");
    const late = safeAttemptTransition(actor, {
      type: "EVIDENCE_READY",
      correlation_id: corr,
      effect_generation: gen,
    });
    expect(late.accepted).toBe(false);
    expect(late.reason_code).toBe("STALE_COMPLETION");
    expect(getSessionState(actor)).toBe("active.playable");
  });

  it("F26: matching VOICE_FINAL / EVIDENCE_READY succeed", () => {
    const actor = createSessionActor();
    seedSources(actor);
    safeAttemptTransition(actor, { type: "START_VOICE" });
    const v = getSessionContext(actor);
    const ok = safeAttemptTransition(actor, {
      type: "VOICE_FINAL",
      correlation_id: v.correlation_id!,
      effect_generation: v.effect_generation,
    });
    expect(ok.accepted).toBe(true);
    expect(getSessionState(actor)).toBe("active.reading");
  });

  it("STALE_RETRY after STOP bumps generation in recoverable_error", () => {
    const actor = createSessionActor();
    seedSources(actor);
    safeAttemptTransition(actor, {
      type: "SESSION_FAILED",
      code: "E",
      message: "x",
      retryable: true,
    });
    expect(getSessionState(actor)).toBe("recoverable_error");
    safeAttemptTransition(actor, { type: "STOP" });
    const stale = safeAttemptTransition(actor, { type: "RETRY" });
    expect(stale.accepted).toBe(false);
    expect(stale.reason_code).toBe("STALE_RETRY");
  });

  it("retryable SESSION_FAILED → RETRY; non-retryable rejected", () => {
    const actor = createSessionActor();
    seedSources(actor);
    safeAttemptTransition(actor, {
      type: "SESSION_FAILED",
      code: "VOICE_ERROR",
      message: "mic denied",
      retryable: true,
    });
    expect(safeAttemptTransition(actor, { type: "RETRY" }).accepted).toBe(true);
    expect(getSessionState(actor)).toBe("active.reading");

    const a2 = createSessionActor();
    safeAttemptTransition(a2, {
      type: "SESSION_FAILED",
      code: "FATAL",
      message: "nope",
      retryable: false,
    });
    const bad = safeAttemptTransition(a2, { type: "RETRY" });
    expect(bad.reason_code).toBe("NOT_RETRYABLE");
  });

  it("EVIDENCE_READY → evidence; COLLAPSE → reading keeps world ids", () => {
    const actor = createSessionActor();
    openWorldHappyPath(actor);
    const ctx = getSessionContext(actor);
    expect(ctx.correlation_id).toBeTruthy();
    const worldId = ctx.world_id;
    const ev = safeAttemptTransition(actor, {
      type: "EVIDENCE_READY",
      correlation_id: ctx.correlation_id!,
      effect_generation: ctx.effect_generation,
    });
    expect(ev.accepted).toBe(true);
    expect(getSessionState(actor)).toBe("active.evidence");
    safeAttemptTransition(actor, { type: "COLLAPSE" });
    expect(getSessionState(actor)).toBe("active.reading");
    expect(getSessionContext(actor).world_id).toBe(worldId);
  });

  it("F28: source/relation change → accepted receipt + different hash", () => {
    const actor = createSessionActor();
    seedSources(actor);
    const h1 = sessionReplayHash(actor);
    const r = seedSources(actor, "exp_t004", [
      "smith.b1.c1.division",
      "other_id",
    ]);
    expect(r.accepted).toBe(true);
    const h2 = sessionReplayHash(actor);
    expect(h2).not.toBe(h1);

    reviewCommitGate(actor, 2);
    const h3 = sessionReplayHash(actor);
    safeAttemptTransition(actor, {
      type: "RELATION_REVIEWED",
      relation_id: "rel_2",
      basis_revision: 0,
    });
    const h4 = sessionReplayHash(actor);
    expect(h4).not.toBe(h3);
  });

  it("F28: deterministic replay — same receipt sequence + final snapshot hash", () => {
    const run = () => {
      const actor = createSessionActor();
      const receipts: SessionTransitionReceipt[] = [];
      const push = (e: ReaderSessionEvent) => {
        receipts.push(safeAttemptTransition(actor, e));
      };
      push({
        type: "SET_SOURCE_SNAPSHOT",
        experience_id: "exp_t004",
        source_snapshot_ids: ["smith.b1.c1.division", "smith.b1.c3.market_extent"],
      });
      push({ type: "ENTER_REVIEWING_GRAPH" });
      push({
        type: "RELATION_REVIEWED",
        relation_id: "rel_1",
        basis_revision: 0,
      });
      push({
        type: "GRAPH_COMMITTED",
        graph_revision: 2,
        accepted_relation_ids: ["rel_1"],
      });
      push({ type: "PLAYABILITY_PASSED", graph_revision: 2 });
      push({ type: "WORLD_OPEN_REQUESTED", graph_revision: 2 });
      const ctx = getSessionContext(actor);
      push({
        type: "WORLD_READY",
        correlation_id: ctx.correlation_id!,
        graph_revision: 2,
        world_id: "world_1",
        world_revision: 1,
        effect_generation: ctx.effect_generation,
      });
      const after = getSessionContext(actor);
      push({
        type: "EVIDENCE_READY",
        correlation_id: after.correlation_id!,
        effect_generation: after.effect_generation,
      });
      push({ type: "STOP" });
      push({ type: "RESUME" });
      return hashFromReceiptsAndActor(receipts, actor);
    };
    expect(run()).toBe(run());
  });

  it("F28: changing a receipt reason/effect fingerprint changes sequence hash", () => {
    const actor = createSessionActor();
    const receipts: SessionTransitionReceipt[] = [];
    receipts.push(
      safeAttemptTransition(actor, {
        type: "SET_SOURCE_SNAPSHOT",
        experience_id: "exp_a",
        source_snapshot_ids: ["s1"],
      }),
    );
    const h1 = hashFromReceiptsAndActor(receipts, actor);
    const mutated = {
      ...receipts[0]!,
      reason_code: "INVALID_TRANSITION" as const,
    };
    const h2 = hashFromReceiptsAndActor([mutated], actor);
    expect(h2).not.toBe(h1);
  });

  it.each([
    "capturing_voice",
    "preparing_world",
    "playable",
    "evidence",
    "paused",
    "recoverable_error",
  ] as const)(
    "F27: source switch from %s → active.reading + cancel old experience",
    (leaf) => {
      const actor = createSessionActor();
      const oldExp = "exp_old";
      seedSources(actor, oldExp);

      if (leaf === "capturing_voice") {
        safeAttemptTransition(actor, { type: "START_VOICE" });
        expect(getSessionState(actor)).toBe("active.capturing_voice");
      } else if (leaf === "preparing_world") {
        reviewCommitGate(actor, 2);
        safeAttemptTransition(actor, {
          type: "WORLD_OPEN_REQUESTED",
          graph_revision: 2,
        });
        expect(getSessionState(actor)).toBe("active.preparing_world");
      } else if (leaf === "playable" || leaf === "evidence" || leaf === "paused") {
        // open without re-seeding (keep exp_old)
        reviewCommitGate(actor, 2);
        safeAttemptTransition(actor, {
          type: "WORLD_OPEN_REQUESTED",
          graph_revision: 2,
        });
        const prep = getSessionContext(actor);
        safeAttemptTransition(actor, {
          type: "WORLD_READY",
          correlation_id: prep.correlation_id!,
          graph_revision: 2,
          world_id: "world_1",
          world_revision: 1,
          effect_generation: prep.effect_generation,
        });
        expect(getSessionState(actor)).toBe("active.playable");
        if (leaf === "evidence") {
          const ctx = getSessionContext(actor);
          safeAttemptTransition(actor, {
            type: "EVIDENCE_READY",
            correlation_id: ctx.correlation_id!,
            effect_generation: ctx.effect_generation,
          });
          expect(getSessionState(actor)).toBe("active.evidence");
        } else if (leaf === "paused") {
          safeAttemptTransition(actor, { type: "STOP" });
          expect(getSessionState(actor)).toBe("paused");
        }
      } else if (leaf === "recoverable_error") {
        safeAttemptTransition(actor, {
          type: "SESSION_FAILED",
          code: "E",
          message: "x",
          retryable: true,
        });
        expect(getSessionState(actor)).toBe("recoverable_error");
      }

      assertSourceSwitchSafe(actor, oldExp, "exp_new");
    },
  );

  it("F29: production barrel does not export raw actor/machine/hash", () => {
    const keys = Object.keys(productionBarrel);
    expect(keys).not.toContain("createSessionActor");
    expect(keys).not.toContain("readerSessionMachine");
    expect(keys).not.toContain("sessionReplayHash");
    expect(keys).not.toContain("hashSessionContract");
    expect(keys).not.toContain("hashReplaySequence");
    expect(keys).toContain("safeAttemptTransition");
    expect(keys).toContain("worldSlotStateFromSession");
  });
});
