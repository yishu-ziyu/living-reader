import { parseVoiceClientCommand } from "@/modules/voice";
import {
  assertSameOrigin,
  sendVoiceCommand,
  stopVoiceSession,
  voiceErrorResponse,
} from "@/modules/voice/server-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: RouteContext<"/api/voice/session/[sessionId]">,
) {
  try {
    assertSameOrigin(request);
    const { sessionId } = await context.params;
    const command = parseVoiceClientCommand(await request.json());
    if (!command) {
      return Response.json(
        {
          ok: false,
          error: { code: "invalid_voice_command", message: "语音命令无效。" },
        },
        { status: 400 },
      );
    }
    sendVoiceCommand(sessionId, command);
    return Response.json({ ok: true });
  } catch (error) {
    return voiceErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/voice/session/[sessionId]">,
) {
  try {
    assertSameOrigin(request);
    const { sessionId } = await context.params;
    stopVoiceSession(sessionId);
    return Response.json({ ok: true });
  } catch (error) {
    return voiceErrorResponse(error);
  }
}
