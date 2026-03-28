import { auth } from "@/auth";
import prisma from "@/lib/db";
import {
  getCommanderOperatorBootstrap,
  toCommentaryRow,
  toHistoryRow,
} from "@/lib/commander/operator-queries";
import type { CommanderFeedEvent } from "@/lib/commander/operator-types";

export const runtime = "nodejs";

function sseLine(data: CommanderFeedEvent) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;

  let interval: ReturnType<typeof setInterval> | undefined;
  let isClosed = false;
  let heartbeatFingerprint = "";
  let lastCommentaryAt = new Date(0);
  let lastRunAt = new Date(0);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      const send = (payload: CommanderFeedEvent) => {
        if (isClosed) return;
        controller.enqueue(enc.encode(sseLine(payload)));
      };

      void (async () => {
        try {
          const boot = await getCommanderOperatorBootstrap(userId, {
            runsTake: 20,
            commentaryTake: 100,
          });
          heartbeatFingerprint = JSON.stringify(boot.heartbeat);
          if (boot.commentary.length) {
            const max = boot.commentary.reduce((m, c) => {
              const t = new Date(c.createdAt);
              return t > m ? t : m;
            }, new Date(0));
            lastCommentaryAt = max;
          }
          if (boot.runs.length) {
            const max = boot.runs.reduce((m, r) => {
              const t = new Date(r.completedAt);
              return t > m ? t : m;
            }, new Date(0));
            lastRunAt = max;
          }
          send({
            type: "hello",
            heartbeat: boot.heartbeat,
            runs: boot.runs,
            commentary: boot.commentary,
          });
        } catch (e) {
          send({
            type: "error",
            message: e instanceof Error ? e.message : "bootstrap failed",
          });
        }
      })();

      interval = setInterval(async () => {
        try {
          const hb = await getCommanderOperatorBootstrap(userId, {
            runsTake: 1,
            commentaryTake: 0,
          });
          const nextFingerprint = JSON.stringify(hb.heartbeat);
          if (nextFingerprint !== heartbeatFingerprint) {
            heartbeatFingerprint = nextFingerprint;
            send({ type: "heartbeat", heartbeat: hb.heartbeat });
          }

          const newRuns = await prisma.commanderScanRun.findMany({
            where: { userId, createdAt: { gt: lastRunAt } },
            orderBy: { createdAt: "asc" },
            take: 20,
          });
          if (newRuns.length) {
            lastRunAt = newRuns[newRuns.length - 1]!.createdAt;
            for (const row of newRuns) {
              send({ type: "scan_run", run: toHistoryRow(row) });
            }
          }

          const newCommentary = await prisma.commanderCommentary.findMany({
            where: { userId, createdAt: { gt: lastCommentaryAt } },
            orderBy: { createdAt: "asc" },
            take: 80,
          });
          if (newCommentary.length) {
            lastCommentaryAt = newCommentary[newCommentary.length - 1]!.createdAt;
            for (const row of newCommentary) {
              send({ type: "commentary", commentary: toCommentaryRow(row) });
            }
          }
        } catch {
          send({
            type: "error",
            message: "commander feed polling error",
          });
        }
      }, 2500);
    },
    cancel() {
      isClosed = true;
      if (interval) clearInterval(interval);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
