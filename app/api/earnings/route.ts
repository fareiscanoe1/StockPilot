import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/db";
import { getEarningsDataAdapter } from "@/lib/adapters/provider-factory";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? "21");
  const adapter = getEarningsDataAdapter();
  const watch = await prisma.watchlistSymbol.findMany({
    where: { watchlist: { userId: session.user.id } },
  });
  const syms = watch.map((w) => w.symbol);
  const rows = adapter
    ? await adapter.getUpcoming(days, syms.length ? syms : undefined)
    : [];
  const stored = await prisma.earningsEvent.findMany({
    orderBy: { datetimeUtc: "asc" },
    take: 100,
  });
  return NextResponse.json({
    disclaimer:
      "Verify dates against Finnhub. STRICT mode uses real calendar data only — no mock earnings.",
    adapter: rows,
    cached: stored,
    earningsDisabled: !adapter,
  });
}
