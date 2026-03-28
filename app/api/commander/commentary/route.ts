import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { appendCommanderCommentary } from "@/lib/commander/operator-queries";
import type { CommanderCommentaryKind } from "@prisma/client";

export const runtime = "nodejs";

const KINDS = new Set<CommanderCommentaryKind>([
  "SYSTEM",
  "STRATEGY_SHIFT",
  "COMMAND_RUN",
  "RISK_ALERT",
]);

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    kind?: CommanderCommentaryKind;
    eventType?: string;
    message?: string;
    payload?: unknown;
    scanRunId?: string | null;
  };
  const kind = body.kind ?? "SYSTEM";
  const eventType = (body.eventType ?? "").trim() || "manual_note";
  const message = (body.message ?? "").trim();
  if (!KINDS.has(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const row = await appendCommanderCommentary({
    userId: session.user.id,
    kind,
    eventType,
    message,
    payload: body.payload,
    scanRunId: body.scanRunId ?? null,
  });

  return NextResponse.json({
    ok: true,
    commentary: {
      id: row.id,
      kind: row.kind,
      eventType: row.eventType,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
      scanRunId: row.scanRunId,
    },
  });
}
