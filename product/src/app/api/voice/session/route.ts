import {
  assertSameOrigin,
  startVoiceSession,
  voiceErrorResponse,
} from "@/modules/voice/server-registry";
import {
  parseVoiceSourceSnapshot,
  snapshotVoiceSource,
  voiceSourceSnapshotsEqual,
} from "@/modules/voice";
import { loadWealthOfNationsBook } from "@/modules/book";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || !("sourceSnapshot" in body)) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "invalid_source_snapshot",
            message: "开始通话前必须固定有效的 SourceBlock 快照。",
          },
        },
        { status: 400 },
      );
    }
    const sourceSnapshot = parseVoiceSourceSnapshot(body.sourceSnapshot);
    if (!sourceSnapshot) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "invalid_source_snapshot",
            message: "开始通话前必须固定有效的 SourceBlock 快照。",
          },
        },
        { status: 400 },
      );
    }

    const loadedBook = await loadWealthOfNationsBook();
    const sourceBlock = loadedBook.ok
      ? loadedBook.value.sourceBlocks.find(
          (block) => block.sourceId === sourceSnapshot.sourceId,
        )
      : undefined;
    if (!sourceBlock) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "source_unavailable",
            message: "无法验证当前原文，实时语音未启动。",
          },
        },
        { status: 503 },
      );
    }
    if (
      !voiceSourceSnapshotsEqual(sourceSnapshot, snapshotVoiceSource(sourceBlock))
    ) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "source_snapshot_stale",
            message: "原文在开始通话前发生变化，请刷新后重试。",
          },
        },
        { status: 409 },
      );
    }

    const session = await startVoiceSession(sourceSnapshot);
    return Response.json({ ok: true, session });
  } catch (error) {
    return voiceErrorResponse(error);
  }
}
