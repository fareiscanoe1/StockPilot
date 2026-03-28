import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/db";
import { getMarketDataAdapter } from "@/lib/adapters/provider-factory";
import { PortfolioSimulator } from "@/lib/engines/portfolio-simulator";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const accounts = await prisma.virtualAccount.findMany({
    where: { userId },
    include: { holdings: true },
  });
  const market = getMarketDataAdapter();
  const marks: Record<string, number> = {};
  const symbols = new Set<string>();
  accounts.forEach((a) => a.holdings.forEach((h) => symbols.add(h.symbol)));
  if (market) {
    for (const s of symbols) {
      const q = await market.getQuote(s);
      if (q) marks[s] = q.last;
    }
  }

  let totalEquity = 0;
  let todayPnl = 0;
  const exposureBySector: Record<string, number> = {};
  let optionsPremiumAtRisk = 0;

  for (const a of accounts) {
    const pv = await PortfolioSimulator.portfolioValue(a.id, marks);
    totalEquity += pv;
    todayPnl += Number(a.dailyPnl);
    for (const h of a.holdings) {
      const sec = h.sector ?? "UNKNOWN";
      const px = marks[h.symbol] ?? Number(h.avgCost);
      exposureBySector[sec] = (exposureBySector[sec] ?? 0) + Number(h.quantity) * px;
      if (h.assetType === "OPTION") {
        optionsPremiumAtRisk += Number(h.quantity) * Number(h.avgCost) * 100;
      }
    }
  }

  const upcoming = await prisma.earningsEvent.findMany({
    where: {
      symbol: { in: [...symbols] },
      datetimeUtc: { gte: new Date() },
    },
    orderBy: { datetimeUtc: "asc" },
    take: 8,
  });

  const latestAlerts = await prisma.alert.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  const recs = await prisma.recommendationLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  return NextResponse.json({
    simulatedOnly: true,
    totalEquity,
    todayPnl,
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      subPortfolio: a.subPortfolio,
      cash: Number(a.cashBalance),
      positionCount: a.holdings.length,
    })),
    exposureBySector,
    optionsPremiumAtRisk,
    upcomingEarnings: upcoming,
    latestAlerts,
    latestRecommendations: recs,
  });
}
