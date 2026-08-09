import "server-only";

import { randomUUID } from "node:crypto";
import type { VoiceSourceSnapshot } from "./contracts";
import {
  buildStepFunSessionUpdate,
  normalizeStepFunServerEvent,
  STEPFUN_REALTIME_URL,
  withEventId,
  type VoiceBrowserEvent,
  type VoiceClientCommand,
} from "./stepfun-protocol";

const SESSION_MAX_AGE_MS = 30 * 60 * 1000;
const READY_TIMEOUT_MS = 12_000;
const CLOSED_HISTORY_MS = 60_000;
const MAX_SESSIONS = 4;
const MAX_EVENT_HISTORY = 500;
const MAX_BUFFERED_BYTES = 2 * 1024 * 1024;

type NodeWebSocketConstructor = new (
  url: string,
  options: {
    headers: Record<string, string>;
    protocols?: string[];
  },
) => WebSocket;

type SequencedEvent = Readonly<{
  sequence: number;
  event: VoiceBrowserEvent;
}>;

type VoiceSession = {
  id: string;
  socket: WebSocket;
  sourceSnapshot: VoiceSourceSnapshot;
  createdAt: number;
  closed: boolean;
  sequence: number;
  history: SequencedEvent[];
  subscribers: Set<(entry: SequencedEvent) => void>;
};

type RegistryState = {
  sessions: Map<string, VoiceSession>;
};

const registryKey = Symbol.for("living-reader.voice-session-registry");
const globalRegistry = globalThis as typeof globalThis & {
  [registryKey]?: RegistryState;
};

const registry =
  globalRegistry[registryKey] ??
  (globalRegistry[registryKey] = { sessions: new Map() });

export class VoiceBridgeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "VoiceBridgeError";
  }
}

function publish(session: VoiceSession, event: VoiceBrowserEvent) {
  const entry = Object.freeze({
    sequence: (session.sequence += 1),
    event,
  });
  session.history.push(entry);
  if (session.history.length > MAX_EVENT_HISTORY) {
    session.history.splice(0, session.history.length - MAX_EVENT_HISTORY);
  }
  for (const subscriber of session.subscribers) subscriber(entry);
}

function closeSession(session: VoiceSession, reason: string) {
  if (session.closed) return;
  session.closed = true;
  publish(session, { type: "voice.closed", reason });
  if (session.socket.readyState < 2) session.socket.close(1000, reason);
  setTimeout(() => registry.sessions.delete(session.id), CLOSED_HISTORY_MS).unref();
}

function pruneExpiredSessions() {
  const cutoff = Date.now() - SESSION_MAX_AGE_MS;
  for (const session of registry.sessions.values()) {
    if (session.createdAt < cutoff) closeSession(session, "会话已达到 30 分钟上限。");
  }
}

function parseProviderMessage(data: unknown): unknown {
  if (typeof data === "string") return JSON.parse(data);
  if (data instanceof ArrayBuffer) {
    return JSON.parse(new TextDecoder().decode(data));
  }
  if (ArrayBuffer.isView(data)) {
    return JSON.parse(
      new TextDecoder().decode(
        new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      ),
    );
  }
  throw new Error("Unsupported provider message type");
}

export async function startVoiceSession(
  sourceSnapshot: VoiceSourceSnapshot,
): Promise<{ id: string; sourceSnapshot: VoiceSourceSnapshot }> {
  pruneExpiredSessions();
  const activeCount = [...registry.sessions.values()].filter(
    (session) => !session.closed,
  ).length;
  if (activeCount >= MAX_SESSIONS) {
    throw new VoiceBridgeError(
      "voice_capacity_reached",
      "实时语音会话已满，请停止其他通话后重试。",
      429,
    );
  }

  const apiKey = process.env.STEPFUN_API_KEY?.trim();
  if (!apiKey) {
    throw new VoiceBridgeError(
      "voice_not_configured",
      "服务端尚未配置 STEPFUN_API_KEY，可继续使用文字输入。",
      503,
    );
  }
  if (typeof globalThis.WebSocket !== "function") {
    throw new VoiceBridgeError(
      "voice_runtime_unsupported",
      "当前服务端运行时不支持安全的 Realtime WebSocket 中继。",
      503,
    );
  }

  const WebSocketWithHeaders =
    globalThis.WebSocket as unknown as NodeWebSocketConstructor;
  const socket = new WebSocketWithHeaders(STEPFUN_REALTIME_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
    protocols: [],
  });
  const session: VoiceSession = {
    id: randomUUID(),
    socket,
    sourceSnapshot,
    createdAt: Date.now(),
    closed: false,
    sequence: 0,
    history: [],
    subscribers: new Set(),
  };

  await new Promise<void>((resolve, reject) => {
    let created = false;
    let updated = false;
    let settled = false;

    const finishIfReady = () => {
      if (!created || !updated || settled) return;
      settled = true;
      clearTimeout(timeout);
      registry.sessions.set(session.id, session);
      resolve();
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (socket.readyState < 2) socket.close();
      reject(
        new VoiceBridgeError(
          "voice_provider_unavailable",
          "无法建立阶跃实时语音连接，请检查服务端 Key 与套餐额度后重试。",
          502,
        ),
      );
    };
    const timeout = setTimeout(fail, READY_TIMEOUT_MS);

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify(buildStepFunSessionUpdate(sourceSnapshot)));
    });
    socket.addEventListener("error", fail, { once: true });
    socket.addEventListener("message", (message) => {
      let providerEvent: unknown;
      try {
        providerEvent = parseProviderMessage(message.data);
      } catch {
        fail();
        return;
      }
      if (
        typeof providerEvent === "object" &&
        providerEvent !== null &&
        "type" in providerEvent
      ) {
        if (providerEvent.type === "session.created") created = true;
        if (providerEvent.type === "session.updated") updated = true;
        if (providerEvent.type === "error" && !settled) {
          fail();
          return;
        }
      }
      finishIfReady();

      if (settled) {
        const browserEvent = normalizeStepFunServerEvent(providerEvent);
        if (browserEvent) publish(session, browserEvent);
      }
    });
    socket.addEventListener("close", () => {
      if (!settled) {
        fail();
      } else {
        closeSession(session, "阶跃实时语音连接已关闭。");
      }
    });
  });

  return { id: session.id, sourceSnapshot };
}

export function sendVoiceCommand(id: string, command: VoiceClientCommand) {
  pruneExpiredSessions();
  const session = registry.sessions.get(id);
  if (!session || session.closed) {
    throw new VoiceBridgeError(
      "voice_session_not_found",
      "实时语音会话不存在或已经结束。",
      404,
    );
  }
  if (session.socket.readyState !== 1) {
    throw new VoiceBridgeError(
      "voice_session_not_ready",
      "实时语音连接尚未就绪，请稍后重试。",
      409,
    );
  }
  if (session.socket.bufferedAmount > MAX_BUFFERED_BYTES) {
    throw new VoiceBridgeError(
      "voice_backpressure",
      "音频发送速度过快，请稍后重试。",
      429,
    );
  }
  session.socket.send(JSON.stringify(withEventId(command)));
}

export function stopVoiceSession(id: string) {
  const session = registry.sessions.get(id);
  if (session) closeSession(session, "读者已停止通话。");
}

export function subscribeToVoiceSession(
  id: string,
  afterSequence: number,
  listener: (entry: SequencedEvent) => void,
): () => void {
  pruneExpiredSessions();
  const session = registry.sessions.get(id);
  if (!session) {
    throw new VoiceBridgeError(
      "voice_session_not_found",
      "实时语音会话不存在或已经结束。",
      404,
    );
  }
  for (const entry of session.history) {
    if (entry.sequence > afterSequence) listener(entry);
  }
  if (!session.closed) session.subscribers.add(listener);
  return () => session.subscribers.delete(listener);
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const requestHost = request.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    originHost = "invalid";
  }
  if (originHost && (!requestHost || originHost !== requestHost)) {
    throw new VoiceBridgeError(
      "cross_origin_forbidden",
      "实时语音接口仅接受同源请求。",
      403,
    );
  }
}

export function voiceErrorResponse(error: unknown): Response {
  if (error instanceof VoiceBridgeError) {
    return Response.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  return Response.json(
    {
      ok: false,
      error: { code: "voice_internal_error", message: "实时语音服务暂不可用。" },
    },
    { status: 500 },
  );
}
