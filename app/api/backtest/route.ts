import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/db";
import {
  getEarningsDataAdapter,
  getMarketDataAdapter,
} from "@/lib/adapters/provider-factory";
import { BacktestEngine } from "@/lib/engines/backtest-engine";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const runs = await prisma.backtestRun.findMany({
    where: { userId: session.user.id },
    orderBy: { startedAt: "desc" },
    take: 20,
  });
  return NextResponse.json({ runs });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    name?: string;
    symbols?: string[];
    from?: string;
    to?: string;
    initialCash?: number;
  };
  const symbols = body.symbols?.length
    ? body.symbols
    : ["AAPL", "MSFT"];
  const from = body.from ? new Date(body.from) : new Date(Date.now() - 365 * 86400000);
  const to = body.to ? new Date(body.to) : new Date();
  const engine = new BacktestEngine(getMarketDataAdapter(), getEarningsDataAdapter());
  const { id, result } = await engine.run(session.user.id, body.name ?? "Ad-hoc backtest", {
    symbols,
    from,
    to,
    initialCash: body.initialCash ?? 100_000,
  });
  return NextResponse.json({ id, result, exportHint: "Fetch GET /api/backtest and read runs[].result.trades for CSV export." });
}
