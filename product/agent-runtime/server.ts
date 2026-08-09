import { AgentTurnProviderError } from "../src/modules/agent-os/provider";
import {
  parseReadingAgentRuntimeRequest,
  READING_AGENT_RUNTIME_HEALTH_PATH,
  READING_AGENT_RUNTIME_MAX_REQUEST_BYTES,
  READING_AGENT_RUNTIME_PATH,
} from "./contracts";
import { ReadingAgentRegistry } from "./reading-agent";

function errorResponse(error: AgentTurnProviderError): Response {
  return Response.json(
    {
      ok: false,
      error: { code: error.code, message: error.message },
    },
    { status: error.status },
  );
}

function invalidRequest(message: string): Response {
  return errorResponse(
    new AgentTurnProviderError("agent_turn_invalid_request", message, 400),
  );
}

export function createReadingAgentRuntimeHandler(
  registry: ReadingAgentRegistry,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    if (
      request.method === "GET" &&
      url.pathname === READING_AGENT_RUNTIME_HEALTH_PATH
    ) {
      return Response.json({ ok: true });
    }
    if (request.method !== "POST" || url.pathname !== READING_AGENT_RUNTIME_PATH) {
      return Response.json({ ok: false }, { status: 404 });
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return invalidRequest("请求必须使用 application/json。");
    }
    const contentLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > READING_AGENT_RUNTIME_MAX_REQUEST_BYTES
    ) {
      return invalidRequest("请求体过大。");
    }

    try {
      const rawBody = await request.text();
      if (
        new TextEncoder().encode(rawBody).byteLength >
        READING_AGENT_RUNTIME_MAX_REQUEST_BYTES
      ) {
        return invalidRequest("请求体过大。");
      }
      let body: unknown;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return invalidRequest("请求不是有效 JSON。");
      }
      const parsed = parseReadingAgentRuntimeRequest(body);
      if (!parsed) return invalidRequest("请求字段不符合 AgentTurn 契约。");
      const candidate = await registry.run(parsed, request.signal);
      return Response.json({ ok: true, candidate });
    } catch (error) {
      if (error instanceof AgentTurnProviderError) return errorResponse(error);
      return errorResponse(
        new AgentTurnProviderError(
          "agent_turn_internal_error",
          "语义服务内部错误，世界先不动。",
          500,
        ),
      );
    }
  };
}
