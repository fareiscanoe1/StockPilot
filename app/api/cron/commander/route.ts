import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { CommanderBackgroundWorker } from "@/lib/commander/background-worker";

export const runtime = "nodejs";

/** Trigger one commander heartbeat tick (all users or one via ?userId=). */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? undefined;
  const force = url.searchParams.get("force") === "true";

  const worker = new CommanderBackgroundWorker();
  const result = await worker.runDueUsersTick({ userId, force });
  return NextResponse.json({ ok: true, ...result });
}
