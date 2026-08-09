/**
 * T007 pure IntentDecision classifier.
 * Priority (F40/F41):
 *   explicit_stop > continue > decline_return
 *   > prompt_injection (→ off_topic)
 *   > source_question > off_topic (weather/chat) > unknown
 *
 * Control phrases (continue/decline) match at sentence head with boundary —
 * not whole-string equality — so「继续，讨论市场」stays continue.
 * Never mutates EventStore; never stores raw user text.
 */

export type IntentKind =
  | "explicit_stop"
  | "continue"
  | "decline_return"
  | "source_question"
  | "off_topic"
  | "unknown";

export type IntentDecision = {
  intent: IntentKind;
  /** Short machine reason code — never the user raw string. */
  reason: string;
};

/** Explicit stop: phrase anywhere (highest control). */
const STOP_RE =
  /停止|先别说了|别说了|先别|暂停一下|停一下|(?<![a-z])stop(?![a-z])|(?<![a-z])pause(?![a-z])/i;

/**
 * F41: continue at sentence head — control grammar only (not bare ^继续).
 *
 * Allowed ZH:
 *   - 继续 / 继续一下 / 继续吧 (+ end or punctuation)
 *   - 继续讨论 / 继续看 / 继续读 (+ rest, e.g. 继续讨论市场)
 * Forbidden (must NOT match): 继续性支出、继续教育…、继续沿用…、继续市场研究
 * EN: continue|resume as word boundary.
 */
const CONTINUE_LEAD_RE =
  /^(继续(?:一下|吧|了|着)?)(?=$|[，,。.!?\s])|^继续(?:讨论|看|读)|^(接着聊)(?=$|[，,。.!?\s])|^(接着)(?=$|[，,。.!?\s])|^接着(?:讨论|看|读)|^(恢复)(?=$|[，,。.!?\s])|^(continue|resume)\b/i;

/**
 * F41: decline at sentence head + boundary.
 * Covers: 不用了 / 不要再提醒我 / 别再提醒 / no more
 */
const DECLINE_LEAD_RE =
  /^(不用了|别再提醒(?:我|了)?|不要再提醒(?:我|了)?|不要了|别邀请|不要提醒(?:我|了)?|算了吧|别管我)(?=$|[，,。.!?\s])|^(no more|dismiss)\b/i;

/**
 * F40/F41 injection — before source cues.
 * Includes forget previous/all instructions.
 */
const INJECTION_RE =
  /忽略前文|忽略上面|忽略前面|忽略之前|忽略所有|忽略指令|忽略.*指令|前面的指令|系统提示|系统指令|你是chatgpt|把这段写进|写进书里|忘记指令|扮演|jailbreak|prompt\s*injection|ignore\s+(all\s+)?(previous|prior|above|earlier)\s+instructions?|ignore\s+the\s+(previous|prior|above)\s+instructions?|forget\s+(all\s+)?(previous|prior|the\s+)?instructions?|forget\s+(all\s+)?previous|system\s+(prompt|instruction)s?|disregard\s+(all\s+)?(previous|prior)|override\s+(system|previous)/i;

/** Canonical T006-style source questions + Smith domain cues. */
const SOURCE_RE =
  /分工|市场|熟练|斯密|原文|国富|劳动|speciali[sz]|division|market|smith|熟练吗|限制分工|会让人|discuss\s+market/i;

/** Weather / chitchat fixtures (non-injection off_topic). */
const OFF_TOPIC_RE = /天气|下雨|闲聊|今天心情|吃什么/i;

/**
 * Deterministic fixture classifier for MVP (no LLM / network).
 */
export function classifyIntent(raw: string): IntentDecision {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) {
    return { intent: "unknown", reason: "empty" };
  }

  // 1–3: control (highest). stop > continue > decline
  if (STOP_RE.test(text)) {
    return { intent: "explicit_stop", reason: "explicit_stop_phrase" };
  }
  if (CONTINUE_LEAD_RE.test(text)) {
    return { intent: "continue", reason: "continue_phrase" };
  }
  if (DECLINE_LEAD_RE.test(text)) {
    return { intent: "decline_return", reason: "decline_phrase" };
  }

  // 4: injection before any source-domain cue
  if (INJECTION_RE.test(text)) {
    return { intent: "off_topic", reason: "prompt_injection" };
  }

  // 5: source questions (T006 path)
  if (SOURCE_RE.test(text)) {
    return { intent: "source_question", reason: "source_domain_cue" };
  }

  // 6: weather / chat
  if (OFF_TOPIC_RE.test(text)) {
    return { intent: "off_topic", reason: "off_topic_fixture" };
  }

  return { intent: "unknown", reason: "no_match" };
}
