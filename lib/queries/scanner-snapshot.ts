import prisma from "@/lib/db";
import {
  getDataStackSummary,
  getResolvedStrictProviders,
} from "@/lib/adapters/provider-factory";
import { RiskEngine } from "@/lib/engines/risk-engine";
import { StrictStrategyEngine } from "@/lib/engines/strategy-engine";
import { PortfolioSimulator } from "@/lib/engines/portfolio-simulator";

export async function getScannerSnapshot(userId: string) {
  const profile = await prisma.strategyProfile.findUnique({
    where: { userId },
  });
  const mode = profile?.mode ?? "BALANCED";
  const providers = getResolvedStrictProviders();
  const risk = new RiskEngine(mode, profile?.riskParams as object | undefined);
  const engine = new StrictStrategyEngine(mode, providers, risk);

  const watch = await prisma.watchlistSymbol.findMany({
    where: { watchlist: { userId } },
  });
  const universe =
    watch.length > 0 ? watch.map((w) => w.symbol) : ["AAPL", "MSFT", "NVDA", "AMD", "META"];

  const acc = await prisma.virtualAccount.findFirst({ where: { userId } });
  const marks: Record<string, number> = {};
  if (providers.market) {
    for (const s of universe) {
      const q = await providers.market.getQuote(s);
      if (q) marks[s] = q.last;
    }
  }
  const pv = acc ? await PortfolioSimulator.portfolioValue(acc.id, marks) : 100_000;
  const { candidates, decisions } = await engine.scanUniverse(
    universe,
    pv,
    acc?.subPortfolio ?? "SWING",
  );

  return {
    simulatedOnly: true as const,
    mode,
    universe,
    portfolioValue: pv,
    candidates,
    decisions,
    dataSources: getDataStackSummary(providers.stack),
  };
}
