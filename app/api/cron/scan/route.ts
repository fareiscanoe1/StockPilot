import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { ScanRunner } from "@/lib/engines/scan-runner";
import { CommanderBackgroundWorker } from "@/lib/commander/background-worker";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/** Trigger autonomous scan for all users (or one via ?userId=). Protect with CRON_SECRET. */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const single = url.searchParams.get("userId");
  const runner = new ScanRunner();
  const commanderWorker = new CommanderBackgroundWorker();
  if (single) {
    await runner.runForUser(single);
    const operator = await commanderWorker.runDueUsersTick({
      userId: single,
      force: true,
    });
    return NextResponse.json({ ok: true, userId: single, operator });
  }
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const u of users) {
    await runner.runForUser(u.id);
  }
  const operator = await commanderWorker.runDueUsersTick({ force: true });
  return NextResponse.json({ ok: true, count: users.length, operator });
}
