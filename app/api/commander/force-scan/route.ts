import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { CommanderBackgroundWorker } from "@/lib/commander/background-worker";

export const runtime = "nodejs";

/** Authenticated manual trigger for one immediate background scan cycle. */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const worker = new CommanderBackgroundWorker();
  const result = await worker.runDueUsersTick({ userId: session.user.id, force: true });
  return NextResponse.json({ ok: true, ...result });
}
