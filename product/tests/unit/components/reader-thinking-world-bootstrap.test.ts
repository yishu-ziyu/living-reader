import { describe, expect, it } from "vitest";
import {
  acceptAndCommitRelation,
  proposeCanonicalRelation,
} from "@/modules/agent-os";
import {
  LIVE_PRINCIPAL_ID,
  submitIdea,
  validateAndSealSourceEvidence,
  type ClockPort,
  type IdPort,
  type SourceEvidenceMap,
} from "@/modules/reader-thinking";
import type {
  AppendEventsRequest,
  EventStore,
} from "@/modules/reader-world/event-store";
import {
  createSessionActor,
  getSessionContext,
  getSessionState,
  safeAttemptTransition,
} from "@/modules/session/reader-session.transition";
import { InMemoryEventStore } from "@/infrastructure/event-store/memory";
import { bootstrapCommittedWoolTown } from "@/components/ReaderThinkingProvider";

const EXPERIENCE_ID = "exp_t010_bootstrap";
const FIXED_TIME = "2026-08-09T08:00:00.000Z";

function sourceEvidence(): SourceEvidenceMap {
  const make = (
    source_id: "smith.b1.c1.division" | "smith.b1.c3.market_extent",
    fragment: string,
    pdf_page: number,
  ) => {
    const sealed = validateAndSealSourceEvidence({
      source_id,
      fragment,
      pdf_page,
      print_page: pdf_page,
      edition_id: "oll-wealth-of-nations-1904",
      edition_revision: "1904",
      edition_content_hash: "a".repeat(64),
      source_content_hash: "b".repeat(64),
    });
    if (!sealed.ok) throw new Error(sealed.error.message);
    return sealed.value;
  };

  const division = make("smith.b1.c1.division", "Smith_0206-01_235", 36);
  const market = make("smith.b1.c3.market_extent", "Smith_0206-01_456", 45);
  return {
    [division.source_id]: division,
    [market.source_id]: market,
  };
}

function fixedPorts(store: EventStore) {
  let sequence = 0;
  const ids: IdPort = {
    nextId: (prefix) => `${prefix}_${++sequence}`,
  };
  const clock: ClockPort = {
    nowRfc3339: () => FIXED_TIME,
  };
  return {
    store,
    ids,
    clock,
    experience_id: EXPERIENCE_ID,
    principal_id: LIVE_PRINCIPAL_ID,
  };
}

function sessionForCommittedGraph(graph_revision: number, relation_id: string) {
  const actor = createSessionActor({
    experience_id: EXPERIENCE_ID,
    source_snapshot_ids: [
      "smith.b1.c1.division",
      "smith.b1.c3.market_extent",
    ],
  });
  const send = (event: Parameters<typeof safeAttemptTransition>[1]) =>
    safeAttemptTransition(actor, event);

  expect(send({ type: "ENTER_REVIEWING_GRAPH" }).accepted).toBe(true);
  expect(
    send({
      type: "RELATION_REVIEWED",
      relation_id,
      basis_revision: 2,
    }).accepted,
  ).toBe(true);
  expect(
    send({
      type: "GRAPH_COMMITTED",
      graph_revision,
      accepted_relation_ids: [relation_id],
    }).accepted,
  ).toBe(true);

  return {
    get state() {
      return getSessionState(actor);
    },
    get context() {
      return getSessionContext(actor);
    },
    send,
  };
}

async function acceptedGraph(store: EventStore, evidence: SourceEvidenceMap) {
  const ports = fixedPorts(store);
  const division = evidence["smith.b1.c1.division"];
  const market = evidence["smith.b1.c3.market_extent"];
  if (!division || !market) throw new Error("expected both source evidence snapshots");

  const first = await submitIdea(ports, {
    text: "针厂的分工让每个工人更熟练。",
    source: division,
    idempotency_key: "idea-division",
  });
  if (!first.ok) throw new Error(first.error.message);
  const second = await submitIdea(ports, {
    text: "市场太小时，细分产物可能卖不出去。",
    source: market,
    idempotency_key: "idea-market",
  });
  if (!second.ok) throw new Error(second.error.message);
  const proposal = await proposeCanonicalRelation(ports, {
    idempotency_key: "relation-proposal",
  });
  if (!proposal.ok || !proposal.value.relation_id) {
    throw new Error(proposal.ok ? "expected relation id" : proposal.error.message);
  }
  const accepted = await acceptAndCommitRelation(ports, {
    relation_id: proposal.value.relation_id,
    idempotency_key: "relation-accept",
  });
  if (!accepted.ok) throw new Error(accepted.error.message);
  return { graph: accepted.value.graph, relation_id: proposal.value.relation_id };
}

describe("T010 ReaderThinkingProvider world bootstrap", () => {
  it("atomically installs the canonical seed once, then reaches playable through safe Session events", async () => {
    const inner = new InMemoryEventStore();
    const append_requests: AppendEventsRequest[] = [];
    const store: EventStore = {
      append: async (request) => {
        append_requests.push(request);
        return inner.append(request);
      },
      load: (experience_id, options) => inner.load(experience_id, options),
      getVersion: (experience_id) => inner.getVersion(experience_id),
      getIdempotencyReceipt: (principal_id, experience_id, idempotency_key) =>
        inner.getIdempotencyReceipt(principal_id, experience_id, idempotency_key),
    };
    const evidence = sourceEvidence();
    const accepted = await acceptedGraph(store, evidence);
    const session = sessionForCommittedGraph(
      accepted.graph.graph_revision,
      accepted.relation_id,
    );
    append_requests.length = 0;

    await expect(
      bootstrapCommittedWoolTown({
        store,
        graph: accepted.graph,
        sourceEvidence: evidence,
        session,
        ids: fixedPorts(store).ids,
        clock: fixedPorts(store).clock,
      }),
    ).resolves.toMatchObject({ status: "opened", seeded: true });

    expect(append_requests).toHaveLength(1);
    expect(append_requests[0]).toMatchObject({
      experience_id: EXPERIENCE_ID,
      principal_id: LIVE_PRINCIPAL_ID,
      events: [
        {
          message_name: "reader_world.world.seeded.v1",
          payload: {
            graph_revision: accepted.graph.graph_revision,
            seed: 42,
            ruleset_id: "wool-town-v1",
          },
        },
      ],
    });
    expect(session.state).toBe("active.playable");
    expect(session.context).toMatchObject({
      graph_revision: accepted.graph.graph_revision,
      world_revision: 0,
      world_basis_graph_revision: accepted.graph.graph_revision,
    });

    const beforeRetry = await store.load(EXPERIENCE_ID);
    if (!beforeRetry.ok) throw beforeRetry.error;
    append_requests.length = 0;
    await expect(
      bootstrapCommittedWoolTown({
        store,
        graph: accepted.graph,
        sourceEvidence: evidence,
        session,
        ids: fixedPorts(store).ids,
        clock: fixedPorts(store).clock,
      }),
    ).resolves.toMatchObject({ status: "opened", seeded: false });
    const afterRetry = await store.load(EXPERIENCE_ID);
    if (!afterRetry.ok) throw afterRetry.error;

    expect(append_requests).toHaveLength(0);
    expect(afterRetry.value).toHaveLength(beforeRetry.value.length);
  });

  it("keeps the world closed when the accepted relation no longer has live evidence", async () => {
    const store = new InMemoryEventStore();
    const evidence = sourceEvidence();
    const accepted = await acceptedGraph(store, evidence);
    const session = sessionForCommittedGraph(
      accepted.graph.graph_revision,
      accepted.relation_id,
    );

    await expect(
      bootstrapCommittedWoolTown({
        store,
        graph: accepted.graph,
        sourceEvidence: {},
        session,
        ids: fixedPorts(store).ids,
        clock: fixedPorts(store).clock,
      }),
    ).resolves.toMatchObject({ status: "blocked", reason: "EVIDENCE_UNAVAILABLE" });

    expect(session.state).toBe("active.reviewing_graph");
    const events = await store.load(EXPERIENCE_ID);
    if (!events.ok) throw events.error;
    expect(
      events.value.some(
        (event) => event.message_name === "reader_world.world.seeded.v1",
      ),
    ).toBe(false);
  });
});
