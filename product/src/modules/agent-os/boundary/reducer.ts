/**
 * Pure BoundarySession reducer — no EventStore, no network, no raw text retention.
 */

import {
  classifyIntent,
  type IntentDecision,
  type IntentKind,
} from "@/modules/agent-os/guardian/intent";
import {
  emptyBoundarySession,
  type BoundarySession,
  type SoftReturnViewModel,
} from "./types";

export type BoundaryCommand =
  | {
      type: "SUBMIT";
      text: string;
      /** Active SourceBlock for soft-return CTA target only. */
      active_source_id: string | null;
    }
  | { type: "CTA_RETURN" }
  | { type: "DISMISS_SOFT_RETURN" }
  | { type: "RESET" };

export type BoundaryEffect =
  | { type: "NONE" }
  | { type: "SESSION_STOP" }
  | { type: "SESSION_RESUME" }
  | {
      type: "SOURCE_QUESTION";
      text: string;
      source_id: string | null;
    };

export type BoundaryResult = {
  session: BoundarySession;
  effect: BoundaryEffect;
  /** Decision for this turn (null on pure dismiss). */
  decision: IntentDecision | null;
};

const SOFT_RETURN_LINES = [
  "这段好像先离开了当前原文。",
  "我们可以先回到斯密正在讲的内容。",
  "点下面入口，继续看当前段落。",
];

function buildSoftReturn(
  turn_id: number,
  return_source_id: string | null,
): SoftReturnViewModel {
  return {
    turn_id,
    lines: SOFT_RETURN_LINES.slice(0, 3),
    cta_label: "回到当前原文",
    source_ids: [],
    return_source_id,
  };
}

export function reduceBoundary(
  prev: BoundarySession,
  cmd: BoundaryCommand,
): BoundaryResult {
  if (cmd.type === "RESET") {
    return {
      session: emptyBoundarySession(),
      effect: { type: "NONE" },
      decision: null,
    };
  }

  if (cmd.type === "DISMISS_SOFT_RETURN" || cmd.type === "CTA_RETURN") {
    return {
      session: {
        ...prev,
        soft_return: null,
        clarification: null,
        status_hint: null,
      },
      effect: { type: "NONE" },
      decision: null,
    };
  }

  // SUBMIT
  const decision = classifyIntent(cmd.text);
  const turn_id = prev.turn_id + 1;
  const trace = {
    turn_id,
    intent: decision.intent,
    reason: decision.reason,
  };

  const base: BoundarySession = {
    ...prev,
    turn_id,
    last_intent: decision.intent,
    last_trace: trace,
    clarification: null,
    status_hint: null,
  };

  switch (decision.intent as IntentKind) {
    case "explicit_stop":
      return {
        session: {
          ...base,
          soft_return: null,
        },
        effect: { type: "SESSION_STOP" },
        decision,
      };

    case "continue":
      return {
        session: {
          ...base,
          soft_return_declined: false,
          soft_return: null,
        },
        effect: { type: "SESSION_RESUME" },
        decision,
      };

    case "decline_return":
      return {
        session: {
          ...base,
          soft_return_declined: true,
          soft_return: null,
          status_hint: "已关闭回引提醒；需要时输入「继续」可恢复。",
        },
        effect: { type: "NONE" },
        decision,
      };

    case "source_question":
      return {
        session: {
          ...base,
          soft_return: null,
        },
        effect: {
          type: "SOURCE_QUESTION",
          text: cmd.text.trim(),
          source_id: cmd.active_source_id,
        },
        decision,
      };

    case "off_topic": {
      if (prev.soft_return_declined) {
        return {
          session: {
            ...base,
            soft_return: null,
            status_hint: "当前不会再次邀请回引。输入「继续」可恢复提醒。",
          },
          effect: { type: "NONE" },
          decision,
        };
      }
      return {
        session: {
          ...base,
          soft_return: buildSoftReturn(turn_id, cmd.active_source_id),
        },
        effect: { type: "NONE" },
        decision,
      };
    }

    case "unknown":
    default:
      return {
        session: {
          ...base,
          soft_return: null,
          clarification: "我没太确定你的意思。可以针对当前原文再问一次吗？",
        },
        effect: { type: "NONE" },
        decision,
      };
  }
}
