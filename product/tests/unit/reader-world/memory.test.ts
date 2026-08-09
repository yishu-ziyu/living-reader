import { describe, expect, it } from "vitest";
import {
  buildRelationshipContext,
  projectMemory,
} from "@/modules/reader-world/memory";
import {
  createDomainEventDraft,
  payloadHash,
  validateDomainEventDraft,
  type DomainEvent,
  type MemoryKind,
  type MemoryOrigin,
} from "@/modules/reader-world/events";

const experienceId = "exp_memory_v1";
const producer = { module: "reader_world" as const, instance: "memory-test" };
const security = {
  principal_id: "reader_memory",
  authority: "reader" as const,
  integrity: "local" as const,
};

function canonicalMessageId(streamVersion: number): string {
  return `01K25V2J${String(streamVersion).padStart(18, "0")}`;
}

function noted(
  stream_version: number,
  input: {
    memory_id: string;
    text: string;
    kind?: MemoryKind;
    origin?: MemoryOrigin;
    source_locator?: string | null;
    reader_idea_id?: string | null;
  },
): DomainEvent {
  const kind = input.kind ?? "discussion_theme";
  const draft = createDomainEventDraft({
    message_name: "reader_world.memory.noted.v1",
    message_id: canonicalMessageId(stream_version),
    recorded_at: `2026-08-09T00:00:${String(stream_version).padStart(2, "0")}.000Z`,
    experience_id: experienceId,
    correlation_id: "corr_memory",
    producer,
    security,
    payload: {
      memory_id: input.memory_id,
      kind,
      origin: input.origin ?? "reader_confirmed",
      text: input.text,
      source_locator: input.source_locator ?? null,
      reader_idea_id:
        input.reader_idea_id !== undefined
          ? input.reader_idea_id
          : kind === "idea_ref"
            ? "idea_default"
            : null,
    },
  });
  return { ...draft, stream_version, event_index_in_commit: 0 } as DomainEvent;
}

function retired(stream_version: number, memory_id: string): DomainEvent {
  const draft = createDomainEventDraft({
    message_name: "reader_world.memory.retired.v1",
    message_id: canonicalMessageId(stream_version),
    recorded_at: `2026-08-09T00:00:${String(stream_version).padStart(2, "0")}.000Z`,
    experience_id: experienceId,
    correlation_id: "corr_memory",
    producer,
    security,
    payload: { memory_id },
  });
  return { ...draft, stream_version, event_index_in_commit: 0 } as DomainEvent;
}

describe("memory v1 event contract", () => {
  it("accepts exact noted/retired payloads and rejects unknown fields", () => {
    const note = noted(1, {
      memory_id: "memory_1",
      kind: "idea_ref",
      text: "我想继续比较分工与市场范围。",
      source_locator: "smith.b1.c3.p2",
      reader_idea_id: "idea_7",
    });
    const retire = retired(2, "memory_1");
    expect(validateDomainEventDraft(note).ok).toBe(true);
    expect(validateDomainEventDraft(retire).ok).toBe(true);

    const dirtyPayload = { ...note.payload, created_at: "forbidden" };
    const dirty = validateDomainEventDraft({
      ...note,
      payload: dirtyPayload,
      payload_hash: payloadHash(dirtyPayload),
    });
    expect(dirty.ok).toBe(false);
    if (!dirty.ok) expect(dirty.error.code).toBe("INVALID_PAYLOAD");
  });

  it("enforces text and kind-specific references", () => {
    const tooLong = noted(1, { memory_id: "long", text: "字".repeat(241) });
    expect(validateDomainEventDraft(tooLong).ok).toBe(false);

    const ideaRef = noted(2, {
      memory_id: "idea",
      kind: "idea_ref",
      text: "读者的想法",
      reader_idea_id: null,
    });
    expect(validateDomainEventDraft(ideaRef).ok).toBe(false);

    const position = noted(3, {
      memory_id: "position",
      kind: "read_position",
      text: "读到这里",
      source_locator: null,
    });
    expect(validateDomainEventDraft(position).ok).toBe(false);
  });
});

describe("memory projection and relationship context", () => {
  it("uses retire events as permanent tombstones", () => {
    const events = [
      noted(1, { memory_id: "keep", text: "保留" }),
      noted(2, { memory_id: "gone", text: "删除" }),
      retired(3, "gone"),
      noted(4, { memory_id: "gone", text: "不能复活" }),
    ];

    const projection = projectMemory(experienceId, events);
    expect(projection.memories.map((entry) => entry.memory_id)).toEqual(["keep"]);
    expect(projection.retired_memory_ids).toEqual(["gone"]);
    expect(projection.last_stream_version).toBe(4);
  });

  it("prioritizes the current chapter, caps at 12, and preserves agent observations", () => {
    const events: DomainEvent[] = [
      noted(1, {
        memory_id: "chapter_old",
        text: "章节内较早记忆",
        source_locator: "smith.b1.c3.p1",
      }),
      noted(2, {
        memory_id: "agent_exact",
        text: "模型观察：读者可能仍在比较两章。",
        origin: "agent_observed",
        source_locator: "smith.b1.c3.p9",
      }),
    ];
    for (let i = 3; i <= 15; i += 1) {
      events.push(
        noted(i, {
          memory_id: `other_${i}`,
          text: `其他章节 ${i}`,
          source_locator: "smith.b1.c1.p1",
        }),
      );
    }
    events.push(retired(16, "other_15"));
    events.push(
      noted(17, {
        memory_id: "invitation_1",
        kind: "invitation_question",
        text: "agent-invitation:market",
        source_locator: "smith.b1.c3.p1",
      }),
      noted(18, {
        memory_id: "invitation_2",
        kind: "invitation_question",
        text: "agent-invitation:market",
        source_locator: "smith.b1.c3.p1",
      }),
    );

    const projection = projectMemory(experienceId, events);
    const context = buildRelationshipContext(projection, {
      current_chapter_id: "smith.b1.c3",
      active_recipe_ids: [
        "smith.b1.division-deepening.v1",
        "smith.b1.exchange.v1",
        "smith.b1.market-extent.v1",
        "smith.b1.transport.v1",
        "smith.b1.full-book-history-forbidden.v1",
      ],
    });

    expect(context.current_chapter_id).toBe("smith.b1.c3");
    expect(context.active_recipe_ids).toEqual([
      "smith.b1.division-deepening.v1",
      "smith.b1.exchange.v1",
      "smith.b1.market-extent.v1",
      "smith.b1.transport.v1",
    ]);
    expect(Object.keys(context).sort()).toEqual([
      "active_recipe_ids",
      "current_chapter_id",
      "invited_question_keys",
      "memories",
    ]);
    expect(context.invited_question_keys).toEqual([
      "agent-invitation:market",
    ]);
    expect(context.memories.map((entry) => entry.memory_id)).not.toContain(
      "invitation_1",
    );
    expect(context.memories).toHaveLength(12);
    expect(context.memories.slice(0, 2).map((entry) => entry.memory_id)).toEqual([
      "agent_exact",
      "chapter_old",
    ]);
    expect(context.memories.some((entry) => entry.memory_id === "other_15")).toBe(false);
    expect(context.memories[0]).toMatchObject({
      origin: "agent_observed",
      text: "模型观察：读者可能仍在比较两章。",
    });
    expect(context.memories.every((entry) => [...entry.text].length <= 240)).toBe(true);
  });
});
