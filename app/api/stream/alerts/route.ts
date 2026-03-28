import { auth } from "@/auth";
import prisma from "@/lib/db";

export const runtime = "nodejs";

function sseEncode(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Server-Sent Events — near real-time alert stream for signed-in user. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;
  let last = new Date(0);

  let interval: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (chunk: string) => controller.enqueue(enc.encode(chunk));
      send(sseEncode("hello", { simulatedOnly: true }));

      interval = setInterval(async () => {
        try {
          const rows = await prisma.alert.findMany({
            where: { userId, createdAt: { gt: last } },
            orderBy: { createdAt: "asc" },
            take: 20,
          });
          if (rows.length) {
            last = rows[rows.length - 1]!.createdAt;
            send(sseEncode("alerts", rows));
          }
        } catch {
          send(sseEncode("error", { message: "poll failed" }));
        }
      }, 2500);
    },
    cancel() {
      if (interval) clearInterval(interval);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
