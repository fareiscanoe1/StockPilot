import { auth } from "@/auth";
import prisma from "@/lib/db";
import { redirect } from "next/navigation";
import {
  getDataStackSummary,
  getResolvedStrictProviders,
} from "@/lib/adapters/provider-factory";
import { PortfolioSimulator } from "@/lib/engines/portfolio-simulator";
import { serializeEarningsEventsForClient } from "@/lib/serializers/earnings-cache";
import { parseCommanderFromCustomRules } from "@/lib/commander/prefs";
import { CommanderClient } from "@/components/commander/CommanderClient";
import type { NewsArticle } from "@/lib/adapters/types";
import { getCommanderOperatorBootstrap } from "@/lib/commander/operator-queries";

export default async function CommanderPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in?callbackUrl=/commander");

  const userId = session.user.id;

  const [profile, notifyPrefs, accounts, alerts, earn, watchSyms] = await Promise.all([
    prisma.strategyProfile.findUnique({ where: { userId } }),
    prisma.notificationPreference.findUnique({ where: { userId } }),
    prisma.virtualAccount.findMany({
      where: { userId },
      include: { holdings: true },
    }),
    prisma.alert.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.earningsEvent.findMany({
      where: { datetimeUtc: { gte: new Date() } },
      orderBy: { datetimeUtc: "asc" },
      take: 10,
    }),
    prisma.watchlistSymbol.findMany({
      where: { watchlist: { userId } },
    }),
  ]);

  const mode = profile?.mode ?? "BALANCED";
  const commanderPrefs = parseCommanderFromCustomRules(profile?.customRules, mode);

  const providers = getResolvedStrictProviders();
  const market = providers.market;
  const marks: Record<string, number> = {};
  const watchlistFlat = Array.from(new Set(watchSyms.map((w) => w.symbol)));
  const holdingsUniverse = Array.from(
    new Set(accounts.flatMap((a) => a.holdings.map((h) => h.symbol))),
  );
  const trendSymbols = (watchlistFlat.length ? watchlistFlat : holdingsUniverse).slice(0, 6);
  const symbols = new Set<string>();
  accounts.forEach((a) => a.holdings.forEach((h) => symbols.add(h.symbol)));
  watchSyms.forEach((w) => symbols.add(w.symbol));
  trendSymbols.forEach((s) => symbols.add(s));
  if (market) {
    for (const s of symbols) {
      const q = await market.getQuote(s);
      if (q) marks[s] = q.last;
    }
  }

  let totalEquity = 0;
  for (const a of accounts) {
    totalEquity += await PortfolioSimulator.portfolioValue(a.id, marks);
  }

  const trendFrom = new Date(Date.now() - 45 * 86400000);
  const trendTo = new Date();
  const watchTrends = await Promise.all(
    trendSymbols.map(async (symbol) => {
      if (!market) {
        return {
          symbol,
          source: "unavailable",
          blockedReason: "Market adapter unavailable",
          bars: [] as Array<{ t: string; c: number; v: number }>,
        };
      }
      const candles = await market.getCandles(symbol, "1d", trendFrom, trendTo);
      if (!candles.length) {
        return {
          symbol,
          source: "unavailable",
          blockedReason: "No real candle data returned",
          bars: [] as Array<{ t: string; c: number; v: number }>,
        };
      }
      const sorted = [...candles]
        .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime())
        .slice(-30);
      return {
        symbol,
        source: sorted[0]?.source ?? "unknown",
        bars: sorted.map((c) => ({ t: c.t, c: c.c, v: c.v })),
      };
    }),
  );

  const newsRows: NewsArticle[] = providers.news
    ? await (async () => {
        const general = await providers.news!.getNews(undefined, 10);
        const bySymbol = await Promise.all(
          trendSymbols.slice(0, 3).map((s) => providers.news!.getNews(s, 6)),
        );
        const merged = [...general, ...bySymbol.flat()];
        const seen = new Set<string>();
        const out: NewsArticle[] = [];
        for (const row of merged) {
          const k = `${row.id}:${row.headline}`;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push(row);
          if (out.length >= 14) break;
        }
        return out;
      })()
    : [];

  const dataStack = getDataStackSummary(providers.stack);
  const earningsSerialized = serializeEarningsEventsForClient(earn);
  const operatorBootstrap = await getCommanderOperatorBootstrap(userId, {
    runsTake: 12,
    commentaryTake: 120,
  });

  return (
    <CommanderClient
      initialCommanderPrefs={commanderPrefs}
      initialCustomRules={profile?.customRules ?? null}
      initialRiskParams={profile?.riskParams ?? null}
      notificationPrefs={{
        minTradeAlertConfidence:
          notifyPrefs?.minTradeAlertConfidence != null
            ? Number(notifyPrefs.minTradeAlertConfidence)
            : null,
        alertsHighConvictionOnly: notifyPrefs?.alertsHighConvictionOnly ?? false,
      }}
      portfolio={{
        accountCount: accounts.length,
        totalEquity,
        openLots: accounts.reduce((s, a) => s + a.holdings.length, 0),
      }}
      virtualAccounts={accounts.map((a) => ({
        id: a.id,
        name: a.name,
        subPortfolio: a.subPortfolio,
        startingCash: Number(a.startingCash),
        cashBalance: Number(a.cashBalance),
      }))}
      alerts={alerts.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        createdAt: a.createdAt.toISOString(),
      }))}
      earnings={earningsSerialized}
      watchlist={watchlistFlat}
      watchQuotes={watchlistFlat.map((s) => ({ symbol: s, last: marks[s] ?? null }))}
      watchTrends={watchTrends}
      liveNews={newsRows.map((n) => ({
        id: n.id,
        symbol: n.symbol ?? null,
        headline: n.headline,
        source: n.source,
        url: n.url ?? null,
        publishedAt: n.publishedAt ?? null,
      }))}
      dataStack={dataStack}
      initialDeskHeartbeat={operatorBootstrap.heartbeat}
      initialScanHistory={operatorBootstrap.runs}
      initialOperatorCommentary={operatorBootstrap.commentary}
    />
  );
}
