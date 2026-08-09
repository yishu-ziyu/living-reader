import { assign, setup } from "xstate";
import {
  initialSessionContext,
  type ReaderSessionContext,
  type ReaderSessionEvent,
  type SessionEffectRequest,
  type SessionStateValue,
} from "./reader-session.types";

function clearEffects(): SessionEffectRequest[] {
  return [];
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

/** Clear derived graph/relation/world when source/experience identity changes. */
function clearDerivedFacts(bumpGeneration: number): Partial<ReaderSessionContext> {
  return {
    effect_generation: bumpGeneration,
    correlation_id: null,
    relation_id: null,
    relation_basis_revision: null,
    relation_reviewed: false,
    graph_revision: null,
    graph_committed: false,
    accepted_relation_ids: [],
    playability_passed: false,
    playability_graph_revision: null,
    world_id: null,
    world_revision: null,
    world_basis_graph_revision: null,
    pending_effects: clearEffects(),
  };
}

export const readerSessionMachine = setup({
  types: {
    context: {} as ReaderSessionContext,
    events: {} as ReaderSessionEvent,
  },
  guards: {
    sourceSnapshotReady: ({ context }) =>
      context.source_snapshot_ready && context.source_snapshot_ids.length > 0,
    /** Experience or source set changed → force active.reading (F27). */
    sourceIdentityChanged: ({ context, event }) => {
      if (event.type !== "SET_SOURCE_SNAPSHOT") return false;
      const sameExperience = context.experience_id === event.experience_id;
      const sameSources = arraysEqual(
        context.source_snapshot_ids,
        event.source_snapshot_ids,
      );
      return !sameExperience || !sameSources;
    },
    voiceFinalMatches: ({ context, event }) => {
      if (event.type !== "VOICE_FINAL") return false;
      return (
        event.correlation_id === context.correlation_id &&
        event.effect_generation === context.effect_generation
      );
    },
    evidenceReadyMatches: ({ context, event }) => {
      if (event.type !== "EVIDENCE_READY") return false;
      return (
        event.correlation_id === context.correlation_id &&
        event.effect_generation === context.effect_generation
      );
    },
    playabilityMatchesGraph: ({ context, event }) => {
      if (event.type !== "WORLD_OPEN_REQUESTED") return false;
      return (
        context.relation_reviewed &&
        context.graph_committed &&
        context.playability_passed &&
        context.playability_graph_revision === event.graph_revision &&
        context.graph_revision === event.graph_revision &&
        context.relation_id !== null &&
        context.accepted_relation_ids.includes(context.relation_id)
      );
    },
    worldReadyMatches: ({ context, event }) => {
      if (event.type !== "WORLD_READY") return false;
      return (
        event.correlation_id === context.correlation_id &&
        event.graph_revision === context.graph_revision &&
        event.effect_generation === context.effect_generation
      );
    },
    canResumePlayable: ({ context }) =>
      context.paused_from === "active.playable" &&
      context.graph_revision !== null &&
      context.world_basis_graph_revision === context.graph_revision &&
      context.world_id !== null,
    canResumeEvidence: ({ context }) =>
      context.paused_from === "active.evidence" &&
      context.graph_revision !== null &&
      context.world_basis_graph_revision === context.graph_revision &&
      context.world_id !== null,
    errorRetryableAndFresh: ({ context }) =>
      context.error !== null &&
      context.error.retryable &&
      context.error.basis_generation === context.effect_generation,
  },
  actions: {
    setSourceSnapshot: assign(({ context, event }) => {
      if (event.type !== "SET_SOURCE_SNAPSHOT") return {};
      const sameExperience = context.experience_id === event.experience_id;
      const sameSources = arraysEqual(
        context.source_snapshot_ids,
        event.source_snapshot_ids,
      );
      const identityChanged = !sameExperience || !sameSources;
      const ready = event.source_snapshot_ids.length > 0;
      if (!identityChanged) {
        return {
          source_snapshot_ids: [...event.source_snapshot_ids],
          source_snapshot_ready: ready,
          last_reason: "OK" as const,
          pending_effects: clearEffects(),
        };
      }
      const gen = context.effect_generation + 1;
      // F27: cancel targets the *old* experience being abandoned, not the new one.
      const cancel: SessionEffectRequest = {
        kind: "cancel_all",
        experience_id: context.experience_id ?? "exp_unknown",
        generation: gen,
      };
      return {
        experience_id: event.experience_id,
        source_snapshot_ids: [...event.source_snapshot_ids],
        source_snapshot_ready: ready,
        ...clearDerivedFacts(gen),
        last_reason: "OK" as const,
        pending_effects: [cancel],
        error: null,
        paused_from: null,
      };
    }),
    startVoiceEffects: assign(({ context }) => {
      const generation = context.effect_generation + 1;
      const correlation_id = `voice_g${generation}`;
      const experience_id = context.experience_id ?? "exp_unknown";
      const effect: SessionEffectRequest = {
        kind: "start_voice",
        experience_id,
        correlation_id,
        generation,
      };
      return {
        effect_generation: generation,
        correlation_id,
        last_reason: "OK" as const,
        pending_effects: [effect],
      };
    }),
    enterReviewing: assign({
      last_reason: "OK" as const,
      pending_effects: clearEffects(),
    }),
    markRelationReviewed: assign(({ event }) => {
      if (event.type !== "RELATION_REVIEWED") return {};
      return {
        relation_id: event.relation_id,
        relation_basis_revision: event.basis_revision,
        relation_reviewed: true,
        // New review invalidates later graph/gate until re-committed
        graph_committed: false,
        graph_revision: null,
        accepted_relation_ids: [] as string[],
        playability_passed: false,
        playability_graph_revision: null,
        last_reason: "OK" as const,
        pending_effects: clearEffects(),
      };
    }),
    markGraphCommitted: assign(({ event }) => {
      if (event.type !== "GRAPH_COMMITTED") return {};
      return {
        graph_revision: event.graph_revision,
        graph_committed: true,
        accepted_relation_ids: [...event.accepted_relation_ids],
        playability_passed: false,
        playability_graph_revision: null,
        last_reason: "OK" as const,
        pending_effects: clearEffects(),
      };
    }),
    markPlayability: assign(({ event }) => {
      if (event.type !== "PLAYABILITY_PASSED") return {};
      return {
        playability_passed: true,
        playability_graph_revision: event.graph_revision,
        last_reason: "OK" as const,
        pending_effects: clearEffects(),
      };
    }),
    prepareWorldEffects: assign(({ context, event }) => {
      if (event.type !== "WORLD_OPEN_REQUESTED") return {};
      const generation = context.effect_generation + 1;
      const correlation_id = `world_g${generation}`;
      const experience_id = context.experience_id ?? "exp_unknown";
      const effect: SessionEffectRequest = {
        kind: "prepare_world",
        experience_id,
        correlation_id,
        graph_revision: event.graph_revision,
        generation,
      };
      return {
        effect_generation: generation,
        correlation_id,
        last_reason: "OK" as const,
        pending_effects: [effect],
      };
    }),
    applyWorldReady: assign(({ event }) => {
      if (event.type !== "WORLD_READY") return {};
      return {
        world_id: event.world_id,
        world_revision: event.world_revision,
        world_basis_graph_revision: event.graph_revision,
        last_reason: "OK" as const,
        pending_effects: clearEffects(),
      };
    }),
    stopEffects: assign(({ context }) => {
      const generation = context.effect_generation + 1;
      const experience_id = context.experience_id ?? "exp_unknown";
      const effects: SessionEffectRequest[] = [
        { kind: "cancel_all", experience_id, generation },
      ];
      return {
        effect_generation: generation,
        correlation_id: null,
        last_reason: "OK" as const,
        pending_effects: effects,
      };
    }),
    /** Bump generation while staying in recoverable_error → enables STALE_RETRY. */
    bumpGenerationOnStopInError: assign(({ context }) => {
      const generation = context.effect_generation + 1;
      return {
        effect_generation: generation,
        correlation_id: null,
        last_reason: "OK" as const,
        pending_effects: [
          {
            kind: "cancel_all" as const,
            experience_id: context.experience_id ?? "exp_unknown",
            generation,
          },
        ],
      };
    }),
    clearPause: assign(() => ({
      paused_from: null as SessionStateValue | null,
      last_reason: "OK" as const,
      pending_effects: clearEffects(),
    })),
    setPausedFromReading: assign(() => ({
      paused_from: "active.reading" as SessionStateValue,
    })),
    setPausedFromCapturing: assign(() => ({
      paused_from: "active.capturing_voice" as SessionStateValue,
    })),
    setPausedFromPreparing: assign(() => ({
      paused_from: "active.preparing_world" as SessionStateValue,
    })),
    setPausedFromPlayable: assign(() => ({
      paused_from: "active.playable" as SessionStateValue,
    })),
    setPausedFromEvidence: assign(() => ({
      paused_from: "active.evidence" as SessionStateValue,
    })),
    setError: assign(({ context, event }) => {
      if (event.type !== "SESSION_FAILED") return {};
      return {
        error: {
          code: event.code,
          message: event.message,
          retryable: event.retryable,
          basis_generation: context.effect_generation,
        },
        last_reason: "OK" as const,
        pending_effects: clearEffects(),
      };
    }),
    clearError: assign(() => ({
      error: null,
      last_reason: "OK" as const,
      pending_effects: clearEffects(),
    })),
    collapseToReading: assign(() => ({
      last_reason: "OK" as const,
      pending_effects: clearEffects(),
      error: null,
      paused_from: null as SessionStateValue | null,
    })),
    clearPending: assign(() => ({
      pending_effects: clearEffects(),
    })),
    /** T005: clear graph/gate/world basis; bump generation; cancel effects. */
    invalidateGraphBasis: assign(({ context }) => {
      const generation = context.effect_generation + 1;
      const experience_id = context.experience_id ?? "exp_unknown";
      return {
        ...clearDerivedFacts(generation),
        last_reason: "OK" as const,
        pending_effects: [
          {
            kind: "cancel_all" as const,
            experience_id,
            generation,
          },
        ],
        error: null,
        paused_from: null as SessionStateValue | null,
      };
    }),
  },
}).createMachine({
  id: "reader_session",
  initial: "active",
  context: initialSessionContext(),
  on: {
    // F27: identity change from *any* leaf (incl. playable/preparing/paused/error)
    // must atomically re-enter active.reading with derived facts cleared.
    SET_SOURCE_SNAPSHOT: [
      {
        guard: "sourceIdentityChanged",
        target: "#reader_session.active.reading",
        actions: "setSourceSnapshot",
      },
      {
        actions: "setSourceSnapshot",
      },
    ],
    // T005: any leaf fail-closed to reading when graph basis invalidates
    GRAPH_BASIS_INVALIDATED: {
      target: "#reader_session.active.reading",
      actions: "invalidateGraphBasis",
    },
  },
  states: {
    active: {
      initial: "reading",
      states: {
        reading: {
          on: {
            START_VOICE: {
              guard: "sourceSnapshotReady",
              target: "capturing_voice",
              actions: "startVoiceEffects",
            },
            // T007: explicit_stop from pure reading → paused via safe STOP
            STOP: {
              target: "#reader_session.paused",
              actions: ["stopEffects", "setPausedFromReading"],
            },
            ENTER_REVIEWING_GRAPH: {
              target: "reviewing_graph",
              actions: "enterReviewing",
            },
            RELATION_REVIEWED: {
              actions: "markRelationReviewed",
            },
            // GRAPH_COMMITTED / PLAYABILITY only after review — enforced in transition layer
            GRAPH_COMMITTED: {
              actions: "markGraphCommitted",
            },
            PLAYABILITY_PASSED: {
              actions: "markPlayability",
            },
            WORLD_OPEN_REQUESTED: {
              guard: "playabilityMatchesGraph",
              target: "preparing_world",
              actions: "prepareWorldEffects",
            },
            SESSION_FAILED: {
              target: "#reader_session.recoverable_error",
              actions: "setError",
            },
            COLLAPSE: {
              actions: "collapseToReading",
            },
          },
        },
        capturing_voice: {
          on: {
            VOICE_FINAL: {
              guard: "voiceFinalMatches",
              target: "reading",
              actions: "clearPending",
            },
            STOP: {
              target: "#reader_session.paused",
              actions: ["stopEffects", "setPausedFromCapturing"],
            },
            SESSION_FAILED: {
              target: "#reader_session.recoverable_error",
              actions: "setError",
            },
            COLLAPSE: {
              target: "reading",
              actions: "collapseToReading",
            },
          },
        },
        reviewing_graph: {
          on: {
            RELATION_REVIEWED: {
              actions: "markRelationReviewed",
            },
            GRAPH_COMMITTED: {
              actions: "markGraphCommitted",
            },
            PLAYABILITY_PASSED: {
              actions: "markPlayability",
            },
            WORLD_OPEN_REQUESTED: {
              guard: "playabilityMatchesGraph",
              target: "preparing_world",
              actions: "prepareWorldEffects",
            },
            COLLAPSE: {
              target: "reading",
              actions: "collapseToReading",
            },
            SESSION_FAILED: {
              target: "#reader_session.recoverable_error",
              actions: "setError",
            },
          },
        },
        preparing_world: {
          on: {
            WORLD_READY: {
              guard: "worldReadyMatches",
              target: "playable",
              actions: "applyWorldReady",
            },
            STOP: {
              target: "#reader_session.paused",
              actions: ["stopEffects", "setPausedFromPreparing"],
            },
            SESSION_FAILED: {
              target: "#reader_session.recoverable_error",
              actions: "setError",
            },
            COLLAPSE: {
              target: "reading",
              actions: "collapseToReading",
            },
          },
        },
        playable: {
          on: {
            EVIDENCE_READY: {
              guard: "evidenceReadyMatches",
              target: "evidence",
              actions: "clearPending",
            },
            STOP: {
              target: "#reader_session.paused",
              actions: ["stopEffects", "setPausedFromPlayable"],
            },
            COLLAPSE: {
              target: "reading",
              actions: "collapseToReading",
            },
            SESSION_FAILED: {
              target: "#reader_session.recoverable_error",
              actions: "setError",
            },
          },
        },
        evidence: {
          on: {
            STOP: {
              target: "#reader_session.paused",
              actions: ["stopEffects", "setPausedFromEvidence"],
            },
            COLLAPSE: {
              target: "reading",
              actions: "collapseToReading",
            },
            SESSION_FAILED: {
              target: "#reader_session.recoverable_error",
              actions: "setError",
            },
          },
        },
      },
    },
    paused: {
      on: {
        RESUME: [
          {
            guard: "canResumePlayable",
            target: "active.playable",
            actions: "clearPause",
          },
          {
            guard: "canResumeEvidence",
            target: "active.evidence",
            actions: "clearPause",
          },
          {
            target: "active.reading",
            actions: "clearPause",
          },
        ],
        COLLAPSE: {
          target: "active.reading",
          actions: "collapseToReading",
        },
        DISMISS: {
          target: "active.reading",
          actions: "collapseToReading",
        },
      },
    },
    recoverable_error: {
      on: {
        // STOP bumps generation without leaving error → STALE_RETRY path
        STOP: {
          actions: "bumpGenerationOnStopInError",
        },
        RETRY: {
          guard: "errorRetryableAndFresh",
          target: "active.reading",
          actions: "clearError",
        },
        DISMISS: {
          target: "active.reading",
          actions: "clearError",
        },
        COLLAPSE: {
          target: "active.reading",
          actions: "collapseToReading",
        },
      },
    },
  },
});

export type ReaderSessionMachine = typeof readerSessionMachine;
