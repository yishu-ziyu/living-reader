import {
  Agent,
  type AgentOptions,
  type AgentTool,
  type StreamFn,
} from "@oh-my-pi/pi-agent-core";
import type { Model } from "@oh-my-pi/pi-ai";
import { buildModel } from "@oh-my-pi/pi-catalog/build";
import { type as schema } from "@oh-my-pi/omptype";
import {
  AgentTurnProviderError,
  parseStrictAgentTurnCandidate,
} from "../src/modules/agent-os/provider";
import type { AgentTurnCandidate } from "../src/modules/agent-os/turn";
import type { ReadingAgentRuntimeRequest } from "./contracts";
import { READING_AGENT_SYSTEM_PROMPT } from "./prompt";

const STEPFUN_MODEL = buildModel<"openai-completions">({
  id: "step-3.5-flash",
  name: "Step 3.5 Flash",
  api: "openai-completions",
  provider: "stepfun",
  baseUrl: "https://api.stepfun.com/v1",
  reasoning: false,
  input: ["text"],
  supportsTools: true,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: null,
  maxTokens: 512,
});

const candidateParameters = schema({
  mode: "'discuss' | 'clarify' | 'act' | 'stop'",
  intent_class:
    "'source_question' | 'executable_action' | 'productive_detour' | 'emotion_personal' | 'obvious_off_topic_noise' | null",
  relevance:
    "'directly_anchored' | 'mechanism_adjacent' | 'personal' | 'none' | 'unknown'",
  confidence: "'high' | 'medium' | 'low' | 'unknown'",
  target_source_ids: "string[]",
  evidence_refs: "string[]",
  open_question: "string | null",
  companion_line: "string",
  proposed_action_id: "'deepen_specialization' | 'expand_market' | null",
  pending_action_id: "'deepen_specialization' | 'expand_market' | null",
  reason_codes: "string[]",
});

type GetApiKey = NonNullable<AgentOptions["getApiKey"]>;

type ActiveRun = {
  request: ReadingAgentRuntimeRequest;
  candidate: AgentTurnCandidate | null;
  preparedCandidate: AgentTurnCandidate | null;
};

export type ReadingAgentRegistryOptions = Readonly<{
  streamFn?: StreamFn;
  getApiKey?: GetApiKey;
  model?: Model;
}>;

class ReadingAgentSession {
  readonly #agent: Agent;
  readonly #getApiKey: GetApiKey;
  readonly #model: Model;
  #activeRun: ActiveRun | null = null;

  constructor(options: ReadingAgentRegistryOptions) {
    this.#model = options.model ?? STEPFUN_MODEL;
    this.#getApiKey =
      options.getApiKey ??
      (() => {
        const apiKey = process.env.STEPFUN_API_KEY?.trim();
        return apiKey || undefined;
      });

    const candidateTool: AgentTool<typeof candidateParameters> = {
      name: "propose_candidate",
      label: "Propose candidate",
      description:
        "Return the single source-grounded AgentTurnCandidate for this reader turn.",
      parameters: candidateParameters,
      execute: async () => {
        const activeRun = this.#activeRun;
        if (!activeRun?.preparedCandidate) {
          throw new Error("Candidate was not authorized for this run");
        }
        activeRun.candidate = activeRun.preparedCandidate;
        activeRun.preparedCandidate = null;
        return {
          content: [{ type: "text", text: "Candidate accepted for product review." }],
          details: { accepted: true },
        };
      },
    };

    this.#agent = new Agent({
      initialState: {
        systemPrompt: [READING_AGENT_SYSTEM_PROMPT],
        model: this.#model,
        tools: [candidateTool],
      },
      streamFn: options.streamFn,
      getApiKey: this.#getApiKey,
      getToolChoice: () => ({
        type: "function",
        name: "propose_candidate",
      }),
      transformContext: async (messages) => {
        const request = this.#activeRun?.request;
        if (!request) return messages;
        const context = {
          source: request.source,
          turn: {
            channel: request.turn.channel,
            final_text: request.turn.final_text,
          },
          world: request.turn.world_basis,
          recent_turns: request.turn.recent_turns.map(({ role, visible_text }) => ({
            role,
            visible_text,
          })),
          pending_intent: request.turn.pending_intent
            ? {
                action_id: request.turn.pending_intent.action_id,
                topic_key: request.turn.pending_intent.topic_key,
              }
            : null,
        };
        return [
          ...messages,
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `本轮密封上下文：${JSON.stringify(context)}`,
              },
            ],
            timestamp: Date.now(),
          },
        ];
      },
      beforeToolCall: ({ args }) => {
        const activeRun = this.#activeRun;
        if (!activeRun || activeRun.candidate || activeRun.preparedCandidate) {
          return { block: true, reason: "Only one candidate is allowed per turn" };
        }
        const candidate = parseStrictAgentTurnCandidate(args);
        if (
          !candidate ||
          candidate.target_source_ids.some(
            (sourceId) => sourceId !== activeRun.request.source.source_id,
          ) ||
          candidate.evidence_refs.length !== 0
        ) {
          return { block: true, reason: "Candidate is outside the sealed source" };
        }
        activeRun.preparedCandidate = candidate;
        return undefined;
      },
    });
    this.#agent.setBeforeModelCall(() =>
      this.#activeRun?.candidate
        ? { stop: true, reason: "Candidate captured" }
        : undefined,
    );
  }

  async run(
    request: ReadingAgentRuntimeRequest,
    signal?: AbortSignal,
  ): Promise<AgentTurnCandidate> {
    if (this.#activeRun) {
      throw new AgentTurnProviderError(
        "agent_turn_provider_unavailable",
        "上一轮仍在处理，世界先不动。",
        409,
      );
    }
    const apiKey = await this.#getApiKey(this.#model);
    if (!apiKey) {
      throw new AgentTurnProviderError(
        "agent_turn_not_configured",
        "服务端尚未配置 STEPFUN_API_KEY，世界先不动。",
        503,
      );
    }
    const messagesBefore = [...this.#agent.state.messages];

    const activeRun: ActiveRun = {
      request,
      candidate: null,
      preparedCandidate: null,
    };
    this.#activeRun = activeRun;
    const abort = () => this.#agent.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      if (signal?.aborted) abort();
      await this.#agent.prompt(request.turn.final_text);
      if (signal?.aborted) {
        throw new AgentTurnProviderError(
          "agent_turn_provider_unavailable",
          "语义服务已取消，世界先不动。",
          502,
        );
      }
      if (!activeRun.candidate) {
        throw new AgentTurnProviderError(
          "agent_turn_invalid_response",
          "语义服务返回内容异常，世界先不动。",
          502,
        );
      }
      return activeRun.candidate;
    } catch (error) {
      this.#agent.replaceMessages(messagesBefore);
      if (error instanceof AgentTurnProviderError) throw error;
      throw new AgentTurnProviderError(
        "agent_turn_provider_unavailable",
        "语义服务暂不可用，世界先不动。",
        502,
      );
    } finally {
      signal?.removeEventListener("abort", abort);
      this.#activeRun = null;
    }
  }
}

export class ReadingAgentRegistry {
  readonly #sessions = new Map<string, ReadingAgentSession>();
  readonly #options: ReadingAgentRegistryOptions;

  constructor(options: ReadingAgentRegistryOptions = {}) {
    this.#options = options;
  }

  get sessionCount(): number {
    return this.#sessions.size;
  }

  run(
    request: ReadingAgentRuntimeRequest,
    signal?: AbortSignal,
  ): Promise<AgentTurnCandidate> {
    const key =
      request.turn.world_basis?.experience_id ?? request.turn.source_snapshot_id;
    let session = this.#sessions.get(key);
    if (!session) {
      session = new ReadingAgentSession(this.#options);
      this.#sessions.set(key, session);
    }
    return session.run(request, signal);
  }
}
