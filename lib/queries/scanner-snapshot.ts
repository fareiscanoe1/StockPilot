import prisma from "@/lib/db";
import {
  getDataStackSummary,
  getResolvedStrictProviders,
} from "@/lib/adapters/provider-factory";
import {
  fetchSymbolQuoteDiagnostics,
  type SymbolQuoteDiagnostics,
} from "@/lib/adapters/quote-diagnostics";
import { RiskEngine } from "@/lib/engines/risk-engine";
import {
  StrictStrategyEngine,
  type UniverseScanMeta,
} from "@/lib/engines/strategy-engine";
import { PortfolioSimulator } from "@/lib/engines/portfolio-simulator";
import type { ScanTelemetryFn } from "@/lib/scan/types";
import type { StrategyMode } from "@prisma/client";

export type ScannerSnapshot = {
  simulatedOnly: true;
  mode: StrategyMode;
  universe: string[];
  universeSource: "explicit_symbol" | "watchlist" | "portfolio_holdings" | "none";
  portfolioValue: number;
  candidates: Awaited<ReturnType<StrictStrategyEngine["scanUniverse"]>>["candidates"];
  stockCandidates: Awaited<ReturnType<StrictStrategyEngine["scanUniverse"]>>["stockCandidates"];
  optionCandidates: Awaited<ReturnType<StrictStrategyEngine["scanUniverse"]>>["optionCandidates"];
  decisions: Awaited<ReturnType<StrictStrategyEngine["scanUniverse"]>>["decisions"];
  scanMeta: UniverseScanMeta;
  dataSources: ReturnType<typeof getDataStackSummary>;
  quoteDiagnostics?: SymbolQuoteDiagnostics[];
  minTradeAlertConfidence: number | null;
  alertsHighConvictionOnly: boolean;
};

export type ExecuteScannerSnapshotInput = {
  userId: string;
  /** When set, scan only this symbol (e.g. options page). */
  symbol?: string | null;
  includeQuoteDiagnostics?: boolean;
  telemetry?: ScanTelemetryFn;
};

export async function executeScannerSnapshot(
  input: ExecuteScannerSnapshotInput,
): Promise<ScannerSnapshot> {
  const { userId, symbol, includeQuoteDiagnostics, telemetry } = input;

  const profile = await prisma.strategyProfile.findUnique({
    where: { userId },
  });
  const mode = profile?.mode ?? "BALANCED";
  const providers = getResolvedStrictProviders();
  const risk = new RiskEngine(mode, profile?.riskParams as object | undefined);
  const engine = new StrictStrategyEngine(mode, providers, risk);

  const notifyPrefs = await prisma.notificationPreference.findUnique({
    where: { userId },
  });
  const minTradeAlertConfidence =
    notifyPrefs?.minTradeAlertConfidence != null
      ? Number(notifyPrefs.minTradeAlertConfidence)
      : null;
  const alertsHighConvictionOnly = notifyPrefs?.alertsHighConvictionOnly === true;

  const watch = await prisma.watchlistSymbol.findMany({
    where: { watchlist: { userId } },
  });
  const accounts = await prisma.virtualAccount.findMany({
    where: { userId },
    include: { holdings: true },
  });

  const trimmed = symbol?.trim();
  const watchUniverse = [...new Set(watch.map((w) => w.symbol.trim().toUpperCase()).filter(Boolean))];
  const holdingsUniverse = [
    ...new Set(
      accounts.flatMap((a) => a.holdings.map((h) => h.symbol.trim().toUpperCase()).filter(Boolean)),
    ),
  ];
  const universe = trimmed?.length
    ? [trimmed.toUpperCase()]
    : watchUniverse.length > 0
      ? watchUniverse
      : holdingsUniverse;
  const universeSource: ScannerSnapshot["universeSource"] = trimmed?.length
    ? "explicit_symbol"
    : watchUniverse.length > 0
      ? "watchlist"
      : holdingsUniverse.length > 0
        ? "portfolio_holdings"
        : "none";

  if (!universe.length) {
    telemetry?.({
      type: "log",
      level: "warn",
      message:
        "No symbols configured for scanning (watchlist and holdings are empty). Add symbols to watchlist or pass ?symbol=XYZ.",
    });
  }

  const marks: Record<string, number> = {};
  const markSymbols = [...new Set([...universe, ...holdingsUniverse])];
  if (providers.market) {
    for (const s of markSymbols) {
      const q = await providers.market.getQuote(s);
      if (q) marks[s] = q.last;
    }
  }
  let pv = 0;
  for (const acc of accounts) {
    pv += await PortfolioSimulator.portfolioValue(acc.id, marks);
  }

  telemetry?.({
    type: "scan_begin",
    symbols: universe,
    alertPrefs: {
      minTradeAlertConfidence,
      alertsHighConvictionOnly,
    },
  });
  for (const s of universe) {
    telemetry?.({ type: "symbol_progress", symbol: s, phase: "queued" });
  }

  const {
    candidates,
    stockCandidates,
    optionCandidates,
    decisions,
    scanMeta,
  } = await engine.scanUniverse(
    universe,
    pv,
    accounts[0]?.subPortfolio ?? "SWING",
    telemetry,
  );

  let quoteDiagnostics: SymbolQuoteDiagnostics[] | undefined;
  if (includeQuoteDiagnostics) {
    const poly = process.env.POLYGON_API_KEY;
    const finn = process.env.FINNHUB_API_KEY;
    const sample = universe.slice(0, 5);
    quoteDiagnostics = await Promise.all(
      sample.map(async (sym) => {
        const norm = providers.market ? await providers.market.getQuote(sym) : null;
        return fetchSymbolQuoteDiagnostics(sym, poly, finn, norm);
      }),
    );
  }

  return {
    simulatedOnly: true as const,
    mode,
    universe,
    universeSource,
    portfolioValue: pv,
    candidates,
    stockCandidates,
    optionCandidates,
    decisions,
    scanMeta,
    dataSources: getDataStackSummary(providers.stack),
    quoteDiagnostics,
    minTradeAlertConfidence,
    alertsHighConvictionOnly,
  };
}

export async function getScannerSnapshot(
  userId: string,
  opts?: { includeQuoteDiagnostics?: boolean },
) {
  return executeScannerSnapshot({
    userId,
    includeQuoteDiagnostics: opts?.includeQuoteDiagnostics,
  });
}
