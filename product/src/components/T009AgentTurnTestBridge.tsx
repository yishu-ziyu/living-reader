"use client";

/**
 * Test-only observable seam for the T009 AgentTurn browser contract.
 *
 * This component is reachable only from bridge-hosts.dev.tsx, whose alias is
 * selected when NEXT_PUBLIC_T009_AGENT_TURN_BRIDGE=1. It never becomes part of
 * the production bridge-host module graph.
 */

import { useEffect, useRef } from "react";
import { useReaderThinking } from "./ReaderThinkingProvider";
import { useReaderSession } from "./ReaderSessionProvider";
import type {
  ReaderSessionContext,
  ReaderSessionEvent,
  SessionStateValue,
  SessionTransitionReceipt,
} from "@/modules/session";
import { getBrowserEventStore } from "@/infrastructure/reader-thinking/browser-store";
import { createDomainEventDraftBrowser } from "@/modules/reader-thinking/draft";
import {
  validateAndSealSourceEvidence,
  type SourceEvidenceMap,
} from "@/modules/reader-thinking";
import {
  dispatchWorldAction,
  inspectCurrentWorld,
} from "@/modules/agent-os/world-dispatch";
import { deriveWorldActionIdempotencyKey } from "@/modules/agent-os/turn";
import { payloadHashBrowser } from "@/infrastructure/event-store/indexeddb/browser-hash";
import {
  nextMessageId,
  type DomainEventDraft,
} from "@/modules/reader-world/events";
import { compileReviewedRecipe, type WorldState } from "@/modules/world";

const MARKET_SOURCE_ID = "smith.b1.c3.market_extent";
const DIVISION_SOURCE_ID = "smith.b1.c1.division";
const DIVISION_IDEA_ID = "idea_division";
const MARKET_IDEA_ID = "idea_market";
const RELATION_ID = "rel_specialization_constrained_by_market";
const PRINCIPAL_ID = "principal_t009_test";
const RULESET_ID = "wool-town-v1";
const RECIPE_ID = "smith.b1.market-extent.v1";

type InputChannel = "text" | "voice";
type BasisMutation =
  | "source"
  | "experience"
  | "graph"
  | "world"
  | "ruleset"
  | "stop";

type ReaderSessionApi = {
  state: SessionStateValue;
  context: ReaderSessionContext;
  send: (event: ReaderSessionEvent) => SessionTransitionReceipt;
};

type T009BridgeSnapshot = {
  pending_intent: unknown;
  event_count: number;
  command_count: number;
  world_revision: number | null;
  metrics: WorldState["metrics"] | null;
  state_hash: string | null;
  basis_ready: boolean;
  basis_error: string | null;
  last: {
    mode: "discuss" | "clarify" | "act" | "stop" | "invite_world";
    action: "deepen_specialization" | "expand_market" | null;
    basis: {
      experience_id: string;
      world_id: string;
      graph_revision: number;
      world_revision: number;
      ruleset_id: string;
    } | null;
    companion_line: string;
  } | null;
  receipt: {
    committed?: boolean;
    duplicate?: boolean;
    idempotency_key?: string;
  } | null;
};

export type T009AgentTurnBridgeApi = {
  ready: boolean;
  resetBaseline: () => Promise<void>;
  snapshot: () => Promise<T009BridgeSnapshot>;
  submitFinal: (input: {
    channel: InputChannel;
    final_text: string;
    turn_id?: string;
  }) => Promise<unknown>;
  mutateBasis: (input: { kind: BasisMutation }) => Promise<void>;
};

type BridgeWindow = Window & {
  __T009_AGENT_TURN__?: T009AgentTurnBridgeApi;
};

function makeIdentity(sequence: number) {
  const nonce = globalThis.crypto.randomUUID();
  return {
    experience_id: `exp_t009_bridge_${sequence}_${nonce}`,
    world_id: `world_t009_bridge_${sequence}_${nonce}`,
  };
}

function isAgentTurnAction(
  value: string,
): value is "deepen_specialization" | "expand_market" {
  return value === "deepen_specialization" || value === "expand_market";
}

function requireAccepted(
  receipt: SessionTransitionReceipt,
  label: string,
) {
  if (!receipt.accepted) {
    throw new Error(`T009 bridge session transition ${label} failed: ${receipt.reason_code}`);
  }
  return receipt;
}

function sealedEvidenceRefs(
  sourceEvidence: SourceEvidenceMap,
  sourceId: string,
): string[] {
  const source = sourceEvidence[sourceId];
  if (!source) {
    throw new Error(`T009 bridge sealed source evidence unavailable: ${sourceId}`);
  }
  const sealed = validateAndSealSourceEvidence({
    source_id: source.source_id,
    fragment: source.fragment,
    ...(source.pdf_page === undefined
      ? {}
      : { pdf_page: source.pdf_page }),
    print_page: source.print_page,
    edition_id: source.edition_id,
    edition_revision: source.edition_revision,
    edition_content_hash: source.edition_content_hash,
    source_content_hash: source.source_content_hash,
  });
  if (!sealed.ok) {
    throw new Error(
      `T009 bridge could not seal source evidence ${sourceId}: ${sealed.error.code}`,
    );
  }
  return [...sealed.value.evidence_refs];
}

function transitionToPlayable(
  session: ReaderSessionApi,
  input: {
    graph_revision: number;
    world_id: string;
    world_revision: number;
    relation_id: string;
    relation_basis_revision: number;
  },
) {
  requireAccepted(session.send({ type: "ENTER_REVIEWING_GRAPH" }), "ENTER_REVIEWING_GRAPH");
  requireAccepted(
    session.send({
      type: "RELATION_REVIEWED",
      relation_id: input.relation_id,
      basis_revision: input.relation_basis_revision,
    }),
    "RELATION_REVIEWED",
  );
  requireAccepted(
    session.send({
      type: "GRAPH_COMMITTED",
      graph_revision: input.graph_revision,
      accepted_relation_ids: [input.relation_id],
    }),
    "GRAPH_COMMITTED",
  );
  requireAccepted(
    session.send({
      type: "PLAYABILITY_PASSED",
      graph_revision: input.graph_revision,
    }),
    "PLAYABILITY_PASSED",
  );
  const opening = requireAccepted(
    session.send({
      type: "WORLD_OPEN_REQUESTED",
      graph_revision: input.graph_revision,
    }),
    "WORLD_OPEN_REQUESTED",
  );
  const correlationId = opening.context_fingerprint.correlation_id;
  if (!correlationId) {
    throw new Error("T009 bridge WORLD_OPEN_REQUESTED did not yield a correlation id");
  }
  requireAccepted(
    session.send({
      type: "WORLD_READY",
      correlation_id: correlationId,
      effect_generation: opening.context_fingerprint.effect_generation,
      graph_revision: input.graph_revision,
      world_id: input.world_id,
      world_revision: input.world_revision,
    }),
    "WORLD_READY",
  );
}

async function settleReact() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

export function T009AgentTurnTestBridge() {
  const thinking = useReaderThinking();
  const session = useReaderSession();
  const sequenceRef = useRef(0);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_T009_AGENT_TURN_BRIDGE !== "1") {
      return;
    }

    const nextTurnId = (prefix: string) => {
      sequenceRef.current += 1;
      return `${prefix}-${sequenceRef.current}`;
    };

    const installBaseline = async () => {
      const graphRevision = 1;
      const ideaBasisRevision = 2;
      const identity = makeIdentity(++sequenceRef.current);
      const worldId = `world_wool_town_g${graphRevision}`;
      const compiled = compileReviewedRecipe({
        recipe_id: RECIPE_ID,
        seed: 42,
        experience_id: identity.experience_id,
        world_id: worldId,
        graph_revision: graphRevision,
      });
      if (!compiled.ok) {
        throw new Error("T009 bridge could not compile its reviewed recipe");
      }
      const recordedAt = new Date().toISOString();
      const divisionEvidence = sealedEvidenceRefs(
        thinking.sourceEvidence,
        DIVISION_SOURCE_ID,
      );
      const marketEvidence = sealedEvidenceRefs(
        thinking.sourceEvidence,
        MARKET_SOURCE_ID,
      );
      const relationEvidence = [
        ...new Set([...divisionEvidence, ...marketEvidence]),
      ];

      requireAccepted(
        session.send({
          type: "SET_SOURCE_SNAPSHOT",
          experience_id: identity.experience_id,
          source_snapshot_ids: [DIVISION_SOURCE_ID, MARKET_SOURCE_ID],
        }),
        "SET_SOURCE_SNAPSHOT",
      );

      const store = await getBrowserEventStore();
      const common = {
        experience_id: identity.experience_id,
        correlation_id: `corr_t009_bridge_${sequenceRef.current}`,
        producer: { module: "reader_world", instance: "t009-test-bridge" },
        security: {
          principal_id: PRINCIPAL_ID,
          authority: "system" as const,
          integrity: "local" as const,
        },
        recorded_at: recordedAt,
      };
      const divisionIdeaMessageId = nextMessageId();
      const marketIdeaMessageId = nextMessageId();
      const relationProposalMessageId = nextMessageId();
      const relationReviewMessageId = nextMessageId();
      const graphCommitMessageId = nextMessageId();
      const seedMessageId = nextMessageId();
      const drafts = await Promise.all([
        createDomainEventDraftBrowser({
          ...common,
          message_name: "reader_world.reader_idea.proposed.v1",
          message_id: divisionIdeaMessageId,
          payload: {
            idea_id: DIVISION_IDEA_ID,
            idea_kind: "observation",
            text: "分工提高生产率。",
            source_ids: [DIVISION_SOURCE_ID],
            evidence_refs: divisionEvidence,
            revision: 1,
            supersedes: null,
          },
        }),
        createDomainEventDraftBrowser({
          ...common,
          message_name: "reader_world.reader_idea.proposed.v1",
          message_id: marketIdeaMessageId,
          payload: {
            idea_id: MARKET_IDEA_ID,
            idea_kind: "observation",
            text: "市场范围会限制进一步分工。",
            source_ids: [MARKET_SOURCE_ID],
            evidence_refs: marketEvidence,
            revision: 1,
            supersedes: null,
          },
        }),
        createDomainEventDraftBrowser({
          ...common,
          message_name: "reader_world.relation.proposed.v1",
          message_id: relationProposalMessageId,
          payload: {
            relation_id: RELATION_ID,
            from_id: DIVISION_IDEA_ID,
            to_id: MARKET_IDEA_ID,
            relation_type: "constrained_by",
            evidence_refs: relationEvidence,
            basis_revision: ideaBasisRevision,
          },
        }),
        createDomainEventDraftBrowser({
          ...common,
          message_name: "reader_world.relation.reviewed.v1",
          message_id: relationReviewMessageId,
          causation_id: relationProposalMessageId,
          payload: {
            relation_id: RELATION_ID,
            decision: "accepted",
            corrections: null,
            basis_revision: ideaBasisRevision,
          },
        }),
        createDomainEventDraftBrowser({
          ...common,
          message_name: "reader_world.graph.committed.v1",
          message_id: graphCommitMessageId,
          causation_id: relationReviewMessageId,
          payload: {
            graph_revision: graphRevision,
            accepted_relation_ids: [RELATION_ID],
            basis_graph_revision: 0,
          },
        }),
        createDomainEventDraftBrowser({
          ...common,
          message_name: "reader_world.world.seeded.v2",
          message_id: seedMessageId,
          causation_id: graphCommitMessageId,
          payload: {
            world_id: worldId,
            graph_revision: graphRevision,
            seed: 42,
            ruleset_id: RULESET_ID,
            recipe_id: RECIPE_ID,
            recipe_fingerprint: compiled.value.recipe_fingerprint,
            normalized_parameters: compiled.value.normalized_parameters,
          },
        }),
      ]);
      const appended = await store.append({
        experience_id: identity.experience_id,
        principal_id: PRINCIPAL_ID,
        idempotency_key: "t009-test-baseline",
        expected_version: -1,
        events: drafts,
      });
      if (!appended.ok || appended.value.duplicate) {
        throw new Error("T009 bridge could not atomically install its isolated baseline");
      }

      transitionToPlayable(session, {
        graph_revision: graphRevision,
        world_id: worldId,
        world_revision: 0,
        relation_id: RELATION_ID,
        relation_basis_revision: ideaBasisRevision,
      });
      await settleReact();
    };

    const currentWorld = async () => {
      const experienceId = session.context.experience_id;
      if (!experienceId) throw new Error("T009 bridge has no current experience");
      const store = await getBrowserEventStore();
      const inspection = await inspectCurrentWorld({
        store,
        experience_id: experienceId,
      });
      if (!inspection.ok) {
        throw new Error(`T009 bridge current world unavailable: ${inspection.code}`);
      }
      return { experienceId, store, state: inspection.world_state };
    };

    const appendBasisEvent = async (
      experienceId: string,
      idempotencyKey: string,
      draft: DomainEventDraft,
    ) => {
      const store = await getBrowserEventStore();
      const version = await store.getVersion(experienceId);
      if (!version.ok) {
        throw new Error("T009 bridge could not read current EventStore version");
      }
      const appended = await store.append({
        experience_id: experienceId,
        principal_id: PRINCIPAL_ID,
        idempotency_key: idempotencyKey,
        expected_version: version.value,
        events: [draft],
      });
      if (!appended.ok || appended.value.duplicate) {
        throw new Error("T009 bridge could not append its basis mutation");
      }
    };

    const snapshot = async (): Promise<T009BridgeSnapshot> => {
      const experienceId = session.context.experience_id;
      const decision = thinking.agentTurnState.last_decision;
      const command = decision?.command;
      const action = command && isAgentTurnAction(command.action)
        ? command.action
        : null;
      const last = decision
        ? {
            mode: decision.mode,
            action,
            basis: command
              ? {
                  experience_id: command.experience_id,
                  world_id: command.world_id,
                  graph_revision: command.graph_revision,
                  world_revision: command.expected_world_revision,
                  ruleset_id: command.ruleset_id,
                }
              : null,
            companion_line: decision.companion_line,
          }
        : null;

      if (!experienceId) {
        return {
          pending_intent: thinking.agentTurnState.pending_intent,
          event_count: 0,
          command_count: thinking.agentTurnState.committed_command_count,
          world_revision: null,
          metrics: null,
          state_hash: null,
          basis_ready: false,
          basis_error: "MISSING_EXPERIENCE",
          last,
          receipt: decision?.dispatch_receipt
            ? {
                committed: decision.dispatch_receipt.committed,
                duplicate: decision.dispatch_receipt.duplicate,
                idempotency_key: decision.idempotency_key ?? undefined,
              }
            : null,
        };
      }

      const store = await getBrowserEventStore();
      const [events, inspection] = await Promise.all([
        store.load(experienceId),
        inspectCurrentWorld({ store, experience_id: experienceId }),
      ]);
      const eventCount = events.ok ? events.value.length : 0;
      if (!inspection.ok) {
        return {
          pending_intent: thinking.agentTurnState.pending_intent,
          event_count: eventCount,
          command_count: thinking.agentTurnState.committed_command_count,
          world_revision: null,
          metrics: null,
          state_hash: null,
          basis_ready: false,
          basis_error: inspection.code,
          last,
          receipt: decision?.dispatch_receipt
            ? {
                committed: decision.dispatch_receipt.committed,
                duplicate: decision.dispatch_receipt.duplicate,
                idempotency_key: decision.idempotency_key ?? undefined,
              }
            : null,
        };
      }
      const state = inspection.world_state;
      return {
        pending_intent: thinking.agentTurnState.pending_intent,
        event_count: eventCount,
        command_count: thinking.agentTurnState.committed_command_count,
        world_revision: state.world_revision,
        metrics: { ...state.metrics },
        // Isolation uses different experience/world identities. Hash only the
        // replayed behavioral state so text/voice equivalence stays meaningful.
        state_hash: await payloadHashBrowser({
          graph_revision: state.graph_revision,
          world_revision: state.world_revision,
          ruleset_id: state.ruleset_id,
          metrics: state.metrics,
        }),
        basis_ready: true,
        basis_error: null,
        last,
        receipt: decision?.dispatch_receipt
          ? {
              committed: decision.dispatch_receipt.committed,
              duplicate: decision.dispatch_receipt.duplicate,
              idempotency_key: decision.idempotency_key ?? undefined,
            }
          : null,
      };
    };

    const api: T009AgentTurnBridgeApi = {
      ready: true,
      resetBaseline: async () => {
        await installBaseline();
      },
      snapshot,
      submitFinal: async ({ channel, final_text, turn_id }) => {
        const decision = await thinking.submitAgentTurn({
          sourceId: MARKET_SOURCE_ID,
          channel,
          final_text,
          turn_id: turn_id ?? nextTurnId(`bridge-${channel}`),
        });
        await settleReact();
        return decision;
      },
      mutateBasis: async ({ kind }) => {
        switch (kind) {
          case "source": {
            const experienceId = session.context.experience_id;
            if (!experienceId) throw new Error("T009 bridge has no current experience");
            requireAccepted(
              session.send({
                type: "SET_SOURCE_SNAPSHOT",
                experience_id: experienceId,
                source_snapshot_ids: [DIVISION_SOURCE_ID],
              }),
              "SET_SOURCE_SNAPSHOT(source mutation)",
            );
            await settleReact();
            return;
          }
          case "experience":
            await installBaseline();
            return;
          case "graph": {
            const { experienceId, state } = await currentWorld();
            const graphRevision = state.graph_revision + 1;
            const messageId = nextMessageId();
            const idempotencyKey =
              `t009-graph-mutation:${state.graph_revision}->${graphRevision}`;
            await appendBasisEvent(
              experienceId,
              idempotencyKey,
              await createDomainEventDraftBrowser({
                message_name: "reader_world.graph.committed.v1",
                experience_id: experienceId,
                correlation_id: `corr_t009_graph_${sequenceRef.current}`,
                causation_id: null,
                producer: { module: "reader_world", instance: "t009-test-bridge" },
                security: {
                  principal_id: PRINCIPAL_ID,
                  authority: "system",
                  integrity: "local",
                },
                message_id: messageId,
                recorded_at: new Date().toISOString(),
                payload: {
                  graph_revision: graphRevision,
                  accepted_relation_ids: [...session.context.accepted_relation_ids],
                  basis_graph_revision: state.graph_revision,
                },
              }),
            );
            return;
          }
          case "world": {
            const { experienceId, store, state } = await currentWorld();
            const actionTurnId = nextTurnId("bridge-world-basis");
            const basis = {
              experience_id: experienceId,
              world_id: state.world_id,
              graph_revision: state.graph_revision,
              world_revision: state.world_revision,
              ruleset_id: state.ruleset_id,
            };
            const advanced = await dispatchWorldAction({
              store,
              principal_id: PRINCIPAL_ID,
              draft_factory: (input) =>
                createDomainEventDraftBrowser<"reader_world.world.event_recorded.v1">({
                  ...input,
                  recorded_at: new Date().toISOString(),
                }),
              turn_id: actionTurnId,
              command: {
                action: "expand_market",
                experience_id: experienceId,
                world_id: state.world_id,
                graph_revision: state.graph_revision,
                expected_world_revision: state.world_revision,
                ruleset_id: state.ruleset_id,
              },
              idempotency_key: deriveWorldActionIdempotencyKey(
                actionTurnId,
                "expand_market",
                basis,
              ),
            });
            if (!advanced.ok || !advanced.committed || advanced.world_revision === null) {
              throw new Error("T009 bridge could not advance the current world basis");
            }
            return;
          }
          case "ruleset": {
            const { experienceId, state } = await currentWorld();
            const messageId = nextMessageId();
            const idempotencyKey =
              `t009-ruleset-mutation:${state.world_id}:${state.graph_revision}`;
            const rotatedWorldId = `${state.world_id}-rotated`;
            const rotated = compileReviewedRecipe({
              recipe_id: RECIPE_ID,
              seed: state.seed,
              experience_id: experienceId,
              world_id: rotatedWorldId,
              graph_revision: state.graph_revision,
            });
            if (!rotated.ok) {
              throw new Error("T009 bridge could not compile its ruleset mutation");
            }
            // A second schema-valid seed with a changed identity makes the
            // authoritative inspector fail closed; no local snapshot is patched.
            await appendBasisEvent(
              experienceId,
              idempotencyKey,
              await createDomainEventDraftBrowser({
                message_name: "reader_world.world.seeded.v2",
                experience_id: experienceId,
                correlation_id: `corr_t009_ruleset_${sequenceRef.current}`,
                causation_id: null,
                producer: { module: "reader_world", instance: "t009-test-bridge" },
                security: {
                  principal_id: PRINCIPAL_ID,
                  authority: "system",
                  integrity: "local",
                },
                message_id: messageId,
                recorded_at: new Date().toISOString(),
                payload: {
                  world_id: rotatedWorldId,
                  graph_revision: state.graph_revision,
                  seed: state.seed,
                  ruleset_id: "wool-town-v1-rotated",
                  recipe_id: RECIPE_ID,
                  recipe_fingerprint: rotated.value.recipe_fingerprint,
                  normalized_parameters: rotated.value.normalized_parameters,
                },
              }),
            );
            return;
          }
          case "stop":
            await thinking.submitAgentTurn({
              sourceId: MARKET_SOURCE_ID,
              channel: "text",
              final_text: "停止",
              turn_id: nextTurnId("bridge-stop"),
            });
            await settleReact();
            return;
        }
      },
    };

    const w = window as BridgeWindow;
    w.__T009_AGENT_TURN__ = api;
    return () => {
      if (w.__T009_AGENT_TURN__ === api) {
        delete w.__T009_AGENT_TURN__;
      }
    };
  }, [session, thinking]);

  return null;
}
