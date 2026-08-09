import { describe, expect, test } from "bun:test";
import type { StreamFn } from "@oh-my-pi/pi-agent-core";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Context,
} from "@oh-my-pi/pi-ai";
import {
  AgentTurnProviderError,
  deriveAgentTurnSourceSnapshotId,
  type VerifiedAgentTurnSource,
} from "../src/modules/agent-os/provider";
import type {
  AgentTurnCandidate,
  AgentTurnProviderInput,
} from "../src/modules/agent-os/turn";
import type { ReadingAgentRuntimeRequest } from "./contracts";
import { ReadingAgentRegistry } from "./reading-agent";
import { createReadingAgentRuntimeHandler } from "./server";

const source: VerifiedAgentTurnSource = {
  source_id: "smith.b1.c3.market_extent",
  edition_id: "oll-wealth-of-nations-1904",
  content_hash: "source-hash",
  title: "Of the Extent of the Market",
  quote: "The division of labour is limited by the extent of the market.",
};

function turn(
  experienceId: string,
  overrides: Partial<AgentTurnProviderInput> = {},
): AgentTurnProviderInput {
  return {
    turn_id: `turn-${experienceId}`,
    channel: "text",
    final_text: "修条路，把货卖到隔壁城去",
    source_snapshot_id: deriveAgentTurnSourceSnapshotId(
      source.source_id,
      source.content_hash,
    ),
    active_source_ids: [source.source_id],
    world_basis: {
      experience_id: experienceId,
      world_id: "wool-town-v1",
      graph_revision: 2,
      world_revision: 0,
      ruleset_id: "wool-town-rules-v1",
    },
    invitation_basis: null,
    recent_turns: [],
    invited_question_keys: [],
    pending_intent: null,
    ...overrides,
  };
}

type StrictCandidate = Omit<
  AgentTurnCandidate,
  | "intent_class"
  | "open_question"
  | "proposed_action_id"
  | "pending_action_id"
  | "recipe_id"
  | "trigger_question"
  | "reason"
> & {
  intent_class: NonNullable<AgentTurnCandidate["intent_class"]> | null;
  open_question: string | null;
  proposed_action_id: NonNullable<AgentTurnCandidate["proposed_action_id"]> | null;
  pending_action_id: NonNullable<AgentTurnCandidate["pending_action_id"]> | null;
  recipe_id: string | null;
  trigger_question: string | null;
  reason: string | null;
};

function candidate(companionLine: string): StrictCandidate {
  return {
    mode: "act",
    intent_class: "executable_action",
    relevance: "mechanism_adjacent",
    confidence: "high",
    target_source_ids: [source.source_id],
    evidence_refs: [],
    open_question: null,
    companion_line: companionLine,
    proposed_action_id: "expand_market",
    pending_action_id: null,
    reason_codes: ["clear_action"],
    recipe_id: null,
    trigger_question: null,
    reason: null,
  };
}

function invitationCandidate(): StrictCandidate {
  return {
    mode: "invite_world",
    intent_class: "source_question",
    relevance: "mechanism_adjacent",
    confidence: "high",
    target_source_ids: [source.source_id],
    evidence_refs: [],
    open_question: null,
    companion_line: "这一步放进世界里看，会更清楚。",
    proposed_action_id: null,
    pending_action_id: null,
    recipe_id: "smith.b1.market-extent.v1",
    trigger_question: "市场扩大后，分工会怎样变化？",
    reason: "这个问题需要对比市场扩大前后的材料流。",
    reason_codes: ["world_explains_mechanism"],
  };
}

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function assistant(
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"],
): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "living-reader-fake",
    model: "deterministic",
    usage,
    stopReason,
    timestamp: Date.now(),
  };
}

function candidateStream(value: StrictCandidate) {
  const stream = createAssistantMessageEventStream();
  queueMicrotask(() => {
    stream.push({ type: "start", partial: assistant([], "toolUse") });
    const toolCall = {
      type: "toolCall" as const,
      id: `candidate-${value.companion_line}`,
      name: "propose_candidate",
      arguments: value,
    };
    const completed = assistant([toolCall], "toolUse");
    stream.push({ type: "toolcall_start", contentIndex: 0, partial: completed });
    stream.push({
      type: "toolcall_end",
      contentIndex: 0,
      toolCall,
      partial: completed,
    });
    stream.push({ type: "done", reason: "toolUse", message: completed });
  });
  return stream;
}

function runtimeRequest(
  experienceId: string,
  overrides: Partial<AgentTurnProviderInput> = {},
): ReadingAgentRuntimeRequest {
  return { source, turn: turn(experienceId, overrides) };
}

describe("T030 ReadingAgentRegistry", () => {
  test("creates a fresh Agent per turn and carries continuity only in sealed input", async () => {
    const contexts: Array<{
      roles: string[];
      texts: string[];
      tools: string[];
      toolChoice: unknown;
    }> = [];
    const scriptedCandidates = [candidate("first"), candidate("second"), candidate("isolated")];
    const streamFn: StreamFn = (_model, context: Context, options) => {
      contexts.push({
        roles: context.messages.map((message) => message.role),
        texts: context.messages.map((message) => JSON.stringify(message)),
        tools: context.tools?.map((tool) => tool.name) ?? [],
        toolChoice: options?.toolChoice,
      });
      const next = scriptedCandidates.shift();
      if (!next) throw new Error("unexpected provider call");
      return candidateStream(next);
    };
    const registry = new ReadingAgentRegistry({
      streamFn,
      getApiKey: () => "test-key",
    });

    await expect(registry.run(runtimeRequest("exp-a"))).resolves.toMatchObject({
      companion_line: "first",
      proposed_action_id: "expand_market",
    });
    await expect(
      registry.run(
        runtimeRequest("exp-a", {
          turn_id: "turn-exp-a-2",
          final_text: "那就修",
          recent_turns: [
            { turn_id: "reader-1", role: "reader", visible_text: "先看看市场。" },
          ],
        }),
      ),
    ).resolves.toMatchObject({ companion_line: "second" });
    await expect(registry.run(runtimeRequest("exp-b"))).resolves.toMatchObject({
      companion_line: "isolated",
    });

    expect(contexts).toHaveLength(3);
    expect(contexts[0]?.tools).toEqual(["propose_candidate"]);
    expect(contexts[0]?.toolChoice).toEqual({
      type: "function",
      name: "propose_candidate",
    });
    expect(contexts[0]?.texts.join("\n")).toContain(source.quote);
    expect(contexts[1]?.roles).not.toContain("toolResult");
    expect(contexts[1]?.texts.join("\n")).not.toContain("first");
    expect(contexts[1]?.texts.join("\n")).toContain("先看看市场。");
    expect(contexts[2]?.roles).not.toContain("toolResult");
    expect(contexts[2]?.texts.join("\n")).not.toContain("first");
  });

  test("isolates concurrent turns that share a client experience id", async () => {
    let call = 0;
    const registry = new ReadingAgentRegistry({
      streamFn: () => candidateStream(candidate(`isolated-${++call}`)),
      getApiKey: () => "test-key",
    });

    const [first, second] = await Promise.all([
      registry.run(runtimeRequest("shared-experience")),
      registry.run(
        runtimeRequest("shared-experience", {
          turn_id: "turn-shared-experience-2",
          final_text: "另一个读者的同时请求",
        }),
      ),
    ]);

    expect([first.companion_line, second.companion_line].sort()).toEqual([
      "isolated-1",
      "isolated-2",
    ]);
  });

  test("passes invitation authority and active recipes into the transient turn", async () => {
    let observedContext = "";
    const registry = new ReadingAgentRegistry({
      streamFn: (_model, context) => {
        observedContext = JSON.stringify(context.messages);
        return candidateStream(invitationCandidate());
      },
      getApiKey: () => "test-key",
    });
    const sourceSnapshotId = deriveAgentTurnSourceSnapshotId(
      source.source_id,
      source.content_hash,
    );

    await expect(
      registry.run(
        runtimeRequest("exp-invite", {
          final_text: "市场扩大后分工会怎样？让我操作看看。",
          world_basis: null,
          invitation_basis: {
            experience_id: "exp-invite",
            graph_revision: 2,
            relation_id: "relation-1",
            relation_basis_revision: 2,
            accepted_relation_ids: ["relation-1"],
            source_snapshot_id: sourceSnapshotId,
          },
          relationship_context: {
            current_chapter_id: "smith.b1.c3",
            memories: [],
            active_recipe_ids: ["smith.b1.market-extent.v1"],
            invited_question_keys: [],
          },
        }),
      ),
    ).resolves.toMatchObject({
      mode: "invite_world",
      recipe_id: "smith.b1.market-extent.v1",
      trigger_question: "市场扩大后，分工会怎样变化？",
    });
    expect(observedContext).toContain('\\"invitation_available\\":true');
    expect(observedContext).toContain("smith.b1.market-extent.v1");
  });

  test("isolates an aborted turn from an overlapping turn with the same experience id", async () => {
    const streamStarted = Promise.withResolvers<void>();
    let activeSignal: AbortSignal | undefined;
    const observedContexts: string[] = [];
    let calls = 0;
    const streamFn: StreamFn = (_model, context, options) => {
      calls += 1;
      observedContexts.push(JSON.stringify(context.messages));
      if (calls > 1) return candidateStream(candidate("isolated-success"));
      activeSignal = options?.signal;
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        streamStarted.resolve();
        stream.push({ type: "start", partial: assistant([], "stop") });
      });
      return stream;
    };
    const registry = new ReadingAgentRegistry({
      streamFn,
      getApiKey: () => "test-key",
    });
    const controller = new AbortController();
    const first = registry.run(runtimeRequest("exp-busy"), controller.signal);
    await streamStarted.promise;

    await expect(
      registry.run(
        runtimeRequest("exp-busy", {
          turn_id: "turn-concurrent",
          final_text: "另一个读者的同时请求",
        }),
      ),
    ).resolves.toMatchObject({ companion_line: "isolated-success" });

    controller.abort("generation superseded");
    await expect(first).rejects.toMatchObject({
      code: "agent_turn_provider_unavailable",
    } satisfies Partial<AgentTurnProviderError>);
    expect(activeSignal?.aborted).toBe(true);
    expect(observedContexts[1]).not.toContain("修条路，把货卖到隔壁城去");
  });
});

describe("T030 Bun runtime HTTP handler", () => {
  test("serves health and a strict candidate without exposing Agent state", async () => {
    const registry = new ReadingAgentRegistry({
      streamFn: () => candidateStream(candidate("runtime-ok")),
      getApiKey: () => "test-key",
    });
    const handler = createReadingAgentRuntimeHandler(registry);

    const health = await handler(new Request("http://127.0.0.1:4317/health"));
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ ok: true });

    const response = await handler(
      new Request("http://127.0.0.1:4317/v1/agent-turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(runtimeRequest("exp-http")),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      candidate: {
        ...candidate("runtime-ok"),
        open_question: undefined,
        pending_action_id: undefined,
        recipe_id: undefined,
        trigger_question: undefined,
        reason: undefined,
      },
    });
  });

  test("fails closed before the Agent for malformed transport input", async () => {
    let calls = 0;
    const registry = new ReadingAgentRegistry({
      streamFn: () => {
        calls += 1;
        return candidateStream(candidate("must-not-run"));
      },
      getApiKey: () => "test-key",
    });
    const handler = createReadingAgentRuntimeHandler(registry);
    const response = await handler(
      new Request("http://127.0.0.1:4317/v1/agent-turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...runtimeRequest("exp-invalid"), extra: true }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "agent_turn_invalid_request" },
    });
    expect(calls).toBe(0);
  });
});
