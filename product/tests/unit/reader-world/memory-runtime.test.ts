import { afterEach, describe, expect, it } from "vitest";
import { InMemoryEventStore } from "@/infrastructure/event-store/memory";
import {
  storeErr,
  type AppendEventsRequest,
  type EventStore,
} from "@/modules/reader-world/event-store";
import {
  loadChapterMemorySnapshot,
  recordInvitationQuestion,
  recordReadPosition,
  retireMemory,
  type MemoryEventDraftInput,
  type MemoryRuntimePorts,
} from "@/modules/reader-world/memory";
import {
  asDomainEventDraft,
  createDomainEventDraft,
  installTestSources,
  type DomainEventDraft,
} from "@/modules/reader-world/events";

const EXPERIENCE_ID = "exp_live_reader";
const PRINCIPAL_ID = "principal_reader_live";
const CHAPTER_ID = "smith.b1.c1";
const SOURCE_IDS = ["smith.b1.c1.p1", "smith.b1.c1.p2"] as const;
const RECORDED_AT = "2026-08-09T15:00:00.000Z";

function ulid(sequence: number): string {
  return `01K25V2J00${String(sequence).padStart(16, "0")}`;
}

function createPorts(): MemoryRuntimePorts {
  let sequence = 0;
  return {
    next_id: () => ulid(++sequence),
    now: () => RECORDED_AT,
    create_event_draft: async (
      input: MemoryEventDraftInput,
    ): Promise<DomainEventDraft> => {
      if (input.message_name === "reader_world.memory.noted.v1") {
        return asDomainEventDraft(createDomainEventDraft(input));
      }
      return asDomainEventDraft(createDomainEventDraft(input));
    },
  };
}

function query(store: InMemoryEventStore) {
  return {
    store,
    experience_id: EXPERIENCE_ID,
    current_chapter_id: CHAPTER_ID,
    source_ids: SOURCE_IDS,
  } as const;
}

function withOneInvitationAppendConflict(
  base: InMemoryEventStore,
  commitConcurrent: (request: AppendEventsRequest) => Promise<void>,
) {
  let invitationAppendCalls = 0;
  const store: EventStore = {
    append: async (request) => {
      if (
        !request.idempotency_key.startsWith("memory.invitation-question:")
      ) {
        return base.append(request);
      }
      invitationAppendCalls += 1;
      if (invitationAppendCalls > 1) return base.append(request);

      await commitConcurrent(request);
      const version = await base.getVersion(request.experience_id);
      if (!version.ok) return version;
      return storeErr(
        "EXPECTED_VERSION_MISMATCH",
        "injected optimistic conflict",
        { current_version: version.value },
      );
    },
    load: (experienceId, options) => base.load(experienceId, options),
    getVersion: (experienceId) => base.getVersion(experienceId),
    getIdempotencyReceipt: (principalId, experienceId, idempotencyKey) =>
      base.getIdempotencyReceipt(principalId, experienceId, idempotencyKey),
  };
  return {
    store,
    invitationAppendCalls: () => invitationAppendCalls,
  };
}

afterEach(() => {
  installTestSources().reset();
});

describe("chapter memory EventStore runtime", () => {
  it("projects the latest canonical read position after reload and keeps replaced events", async () => {
    installTestSources({ deviceId: "device-reader-a" });
    const store = new InMemoryEventStore();
    const ports = createPorts();

    const first = await recordReadPosition({
      ...query(store),
      principal_id: PRINCIPAL_ID,
      source_id: SOURCE_IDS[0],
      ports,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.resume_source_id).toBe(SOURCE_IDS[0]);

    const second = await recordReadPosition({
      ...query(store),
      principal_id: PRINCIPAL_ID,
      source_id: SOURCE_IDS[1],
      ports,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.resume_source_id).toBe(SOURCE_IDS[1]);
    expect(second.value.projection.memories).toHaveLength(1);
    expect(second.value.projection.memories[0]).toMatchObject({
      kind: "read_position",
      origin: "reader_confirmed",
      source_locator: SOURCE_IDS[1],
    });

    const reloaded = await loadChapterMemorySnapshot(query(store));
    expect(reloaded.ok).toBe(true);
    if (!reloaded.ok) return;
    expect(reloaded.value.resume_source_id).toBe(SOURCE_IDS[1]);

    const history = await store.load(EXPERIENCE_ID);
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    expect(history.value.map((event) => event.message_name)).toEqual([
      "reader_world.memory.noted.v1",
      "reader_world.memory.retired.v1",
      "reader_world.memory.noted.v1",
    ]);
    expect(history.value.map((event) => event.message_id)).toEqual([
      ulid(2),
      ulid(4),
      ulid(5),
    ]);
    expect(history.value.map((event) => event.device_id)).toEqual([
      "device-reader-a",
      "device-reader-a",
      "device-reader-a",
    ]);
    expect(history.value.map((event) => event.hlc)).toEqual([
      { physical_ms: Date.parse(RECORDED_AT), logical: 0 },
      { physical_ms: Date.parse(RECORDED_AT), logical: 1 },
      { physical_ms: Date.parse(RECORDED_AT), logical: 2 },
    ]);
  });

  it("appends a retirement tombstone, hides the item, and leaves noted history intact", async () => {
    installTestSources({ deviceId: "device-reader-b" });
    const store = new InMemoryEventStore();
    const ports = createPorts();
    const recorded = await recordReadPosition({
      ...query(store),
      principal_id: PRINCIPAL_ID,
      source_id: SOURCE_IDS[0],
      ports,
    });
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    const memoryId = recorded.value.projection.memories[0]!.memory_id;

    const retired = await retireMemory({
      ...query(store),
      principal_id: PRINCIPAL_ID,
      memory_id: memoryId,
      ports,
    });
    expect(retired.ok).toBe(true);
    if (!retired.ok) return;
    expect(retired.value.resume_source_id).toBeNull();
    expect(retired.value.projection.memories).toEqual([]);
    expect(retired.value.projection.retired_memory_ids).toContain(memoryId);

    const history = await store.load(EXPERIENCE_ID);
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    expect(history.value).toHaveLength(2);
    expect(history.value[0]).toMatchObject({
      message_name: "reader_world.memory.noted.v1",
      payload: { memory_id: memoryId },
    });
    expect(history.value[1]).toMatchObject({
      message_name: "reader_world.memory.retired.v1",
      payload: { memory_id: memoryId },
    });
  });

  it("persists one invitation question key across reloads", async () => {
    installTestSources({ deviceId: "device-reader-c" });
    const store = new InMemoryEventStore();
    const ports = createPorts();
    const questionKey =
      'agent-invitation:{"experience_id":"exp_live_reader","trigger_question":"市场为何限制分工"}';

    const first = await recordInvitationQuestion({
      store,
      experience_id: EXPERIENCE_ID,
      principal_id: PRINCIPAL_ID,
      question_key: questionKey,
      source_id: SOURCE_IDS[0],
      ports,
    });
    const duplicate = await recordInvitationQuestion({
      store,
      experience_id: EXPERIENCE_ID,
      principal_id: PRINCIPAL_ID,
      question_key: questionKey,
      source_id: SOURCE_IDS[0],
      ports,
    });

    expect(first.ok).toBe(true);
    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok) return;
    expect(
      duplicate.value.memories.filter(
        (memory) => memory.kind === "invitation_question",
      ),
    ).toEqual([
      expect.objectContaining({
        text: questionKey,
        origin: "agent_observed",
        source_locator: SOURCE_IDS[0],
      }),
    ]);
    const history = await store.load(EXPERIENCE_ID);
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    expect(history.value).toHaveLength(1);
  });

  it("treats an identical invitation committed during an optimistic conflict as success", async () => {
    installTestSources({ deviceId: "device-reader-d" });
    const base = new InMemoryEventStore();
    const conflict = withOneInvitationAppendConflict(base, async (request) => {
      const committed = await base.append({
        ...request,
        idempotency_key: "concurrent-identical-invitation",
      });
      if (!committed.ok) throw committed.error;
    });
    const questionKey = "agent-invitation:v2:1111111111111111";

    const recorded = await recordInvitationQuestion({
      store: conflict.store,
      experience_id: EXPERIENCE_ID,
      principal_id: PRINCIPAL_ID,
      question_key: questionKey,
      source_id: SOURCE_IDS[0],
      ports: createPorts(),
    });

    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    expect(conflict.invitationAppendCalls()).toBe(1);
    expect(
      recorded.value.memories.filter(
        (memory) => memory.kind === "invitation_question",
      ),
    ).toEqual([
      expect.objectContaining({
        memory_id: `invitation-question:${questionKey}`,
        text: questionKey,
      }),
    ]);
    const history = await base.load(EXPERIENCE_ID);
    if (!history.ok) throw history.error;
    expect(history.value).toHaveLength(1);
  });

  it("reloads and retries an invitation append once after an unrelated optimistic conflict", async () => {
    installTestSources({ deviceId: "device-reader-e" });
    const base = new InMemoryEventStore();
    const conflict = withOneInvitationAppendConflict(base, async (request) => {
      const concurrent = createDomainEventDraft({
        message_name: "reader_world.graph.committed.v1",
        message_id: ulid(90),
        experience_id: EXPERIENCE_ID,
        correlation_id: "corr_concurrent_graph",
        causation_id: null,
        producer: { module: "test", instance: "memory-conflict" },
        security: {
          principal_id: PRINCIPAL_ID,
          authority: "reader",
          integrity: "local",
        },
        recorded_at: RECORDED_AT,
        payload: {
          graph_revision: 1,
          accepted_relation_ids: [],
          basis_graph_revision: 0,
        },
      });
      const committed = await base.append({
        experience_id: request.experience_id,
        principal_id: request.principal_id,
        idempotency_key: "concurrent-unrelated-graph",
        expected_version: request.expected_version,
        events: [concurrent],
      });
      if (!committed.ok) throw committed.error;
    });
    const questionKey = "agent-invitation:v2:2222222222222222";

    const recorded = await recordInvitationQuestion({
      store: conflict.store,
      experience_id: EXPERIENCE_ID,
      principal_id: PRINCIPAL_ID,
      question_key: questionKey,
      source_id: SOURCE_IDS[1],
      ports: createPorts(),
    });

    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    expect(conflict.invitationAppendCalls()).toBe(2);
    expect(
      recorded.value.memories.some(
        (memory) =>
          memory.kind === "invitation_question" &&
          memory.text === questionKey,
      ),
    ).toBe(true);
    const history = await base.load(EXPERIENCE_ID);
    if (!history.ok) throw history.error;
    expect(history.value.map((event) => event.message_name)).toEqual([
      "reader_world.graph.committed.v1",
      "reader_world.memory.noted.v1",
    ]);
  });
});
