import {
  assertSameOrigin,
  subscribeToVoiceSession,
  voiceErrorResponse,
} from "@/modules/voice/server-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

export async function GET(
  request: Request,
  context: RouteContext<"/api/voice/session/[sessionId]/events">,
) {
  try {
    assertSameOrigin(request);
    const { sessionId } = await context.params;
    const lastEventId = Number.parseInt(
      request.headers.get("last-event-id") ?? "0",
      10,
    );
    let unsubscribe = () => {};
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const close = () => {
          if (closed) return;
          closed = true;
          if (heartbeat) clearInterval(heartbeat);
          unsubscribe();
          controller.close();
        };
        const removeSubscription = subscribeToVoiceSession(
          sessionId,
          Number.isFinite(lastEventId) ? lastEventId : 0,
          ({ sequence, event }) => {
            if (closed) return;
            controller.enqueue(
              encoder.encode(
                `id: ${sequence}\nevent: voice\ndata: ${JSON.stringify(event)}\n\n`,
              ),
            );
            if (event.type === "voice.closed") close();
          },
        );
        unsubscribe = removeSubscription;
        if (closed) {
          unsubscribe();
          return;
        }
        heartbeat = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode(": keepalive\n\n"));
        }, 15_000);
        request.signal.addEventListener("abort", close, { once: true });
      },
      cancel() {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return voiceErrorResponse(error);
  }
}
