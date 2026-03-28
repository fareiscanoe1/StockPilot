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
import { parseCommanderFromCustomRules } from "@/lib/commander/prefs";
import {
  buildDiscoveryUniverse,
  isCryptoDiscoverySymbol,
  sanitizeSymbolList,
} from "@/lib/commander/discovery-universe";
import { ensureDefaultWatchlists } from "@/lib/watchlist/defaults";
import type { CommanderUniverseMode, CommanderWatchCategoryTag } from "@/lib/commander/types";
import { findManySymbolPreferences } from "@/lib/symbol-preferences";

export type ScannerSymbolMeta = {
  symbol: string;
  exchange: string;
  source:
    | "explicit_symbol"
    | "watchlist"
    | "ai_discovered"
    | "watchlist_discovery_match"
    | "custom_universe";
  inWatchlist: boolean;
  inDiscovery: boolean;
  watchlists: string[];
  pinned: boolean;
  highPriority: boolean;
  muted: boolean;
  ignored: boolean;
  tags: CommanderWatchCategoryTag[];
};

export type ScannerSnapshot = {
  simulatedOnly: true;
  mode: StrategyMode;
  universe: string[];
  universeSource:
    | "explicit_symbol"
    | "watchlist"
    | "ai_discovery"
    | "watchlist_plus_discovery"
    | "custom_universe"
    | "portfolio_holdings"
    | "none";
  universeMode: CommanderUniverseMode;
  watchlistUniverse: string[];
  discoveryUniverse: string[];
  customUniverse: string[];
  symbolMeta: ScannerSymbolMeta[];
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

  await ensureDefaultWatchlists(userId);
  const commanderPrefs = parseCommanderFromCustomRules(profile?.customRules, mode);

  const [watchlists, symbolPrefs, accounts] = await Promise.all([
    prisma.watchlist.findMany({
      where: { userId },
      include: { symbols: true },
      orderBy: { name: "asc" },
    }),
    findManySymbolPreferences(userId),
    prisma.virtualAccount.findMany({
      where: { userId },
      include: { holdings: true },
    }),
  ]);

  const prefBySymbol = new Map<
    string,
    {
      pinned: boolean;
      highPriority: boolean;
      muted: boolean;
      ignored: boolean;
      tags: CommanderWatchCategoryTag[];
      exchange: string;
    }
  >();
  for (const p of symbolPrefs) {
    const sym = p.symbol.trim().toUpperCase();
    if (!sym) continue;
    prefBySymbol.set(sym, {
      pinned: p.pinned,
      highPriority: p.highPriority,
      muted: p.muted,
      ignored: p.ignored,
      tags: p.tags.map((t) => t.toLowerCase() as CommanderWatchCategoryTag),
      exchange: p.exchange,
    });
  }

  const watchMeta = new Map<string, ScannerSymbolMeta>();
  for (const list of watchlists) {
    for (const s of list.symbols) {
      const sym = s.symbol.trim().toUpperCase();
      if (!sym) continue;
      const pref = prefBySymbol.get(sym);
      const prev = watchMeta.get(sym);
      if (prev) {
        if (!prev.watchlists.includes(list.name)) prev.watchlists.push(list.name);
        prev.pinned = prev.pinned || (pref?.pinned ?? false);
        prev.highPriority = prev.highPriority || (pref?.highPriority ?? false);
        prev.muted = prev.muted || (pref?.muted ?? false);
        prev.ignored = prev.ignored || (pref?.ignored ?? false);
        prev.tags = [...new Set([...prev.tags, ...(pref?.tags ?? [])])];
        continue;
      }
      watchMeta.set(sym, {
        symbol: sym,
        exchange: s.exchange,
        source: "watchlist",
        inWatchlist: true,
        inDiscovery: false,
        watchlists: [list.name],
        pinned: pref?.pinned ?? false,
        highPriority: pref?.highPriority ?? false,
        muted: pref?.muted ?? false,
        ignored: pref?.ignored ?? false,
        tags: pref?.tags ?? [],
      });
    }
  }

  const watchlistUniverse = [...watchMeta.values()]
    .filter((m) => !m.ignored && !m.muted)
    .map((m) => m.symbol);

  const discoveryBase = buildDiscoveryUniverse({
    primaryMode: commanderPrefs.primaryMode,
    size: commanderPrefs.discoveryUniverseSize,
    optionsEnabled: commanderPrefs.toggles.optionsEnabled,
    cryptoEnabled: commanderPrefs.toggles.cryptoEnabled,
  }).filter((sym) => {
    const p = prefBySymbol.get(sym);
    return !(p?.ignored || p?.muted);
  });
  const cryptoDiscoveryCandidates = discoveryBase.filter(isCryptoDiscoverySymbol);
  let validatedCryptoDiscovery = cryptoDiscoveryCandidates;
  if (cryptoDiscoveryCandidates.length) {
    if (!providers.market) {
      validatedCryptoDiscovery = [];
      telemetry?.({
        type: "log",
        level: "warn",
        message:
          "Crypto discovery blocked: no market adapter available for strict crypto quote/candle validation.",
      });
    } else {
      const out: string[] = [];
      const from = new Date(Date.now() - 35 * 86400000);
      const to = new Date();
      for (const sym of cryptoDiscoveryCandidates.slice(0, 20)) {
        const q = await providers.market.getQuote(sym, "CRYPTO");
        if (!q || !Number.isFinite(q.last) || q.last <= 0 || q.volume == null || q.volume <= 0) {
          telemetry?.({
            type: "log",
            level: "warn",
            message: `Crypto discovery blocked for ${sym}: missing strict quote/volume.`,
          });
          continue;
        }
        const candles = await providers.market.getCandles(sym, "1d", from, to, "CRYPTO");
        if (candles.length < 5) {
          telemetry?.({
            type: "log",
            level: "warn",
            message: `Crypto discovery blocked for ${sym}: insufficient candle history.`,
          });
          continue;
        }
        out.push(sym);
      }
      validatedCryptoDiscovery = out;
    }
  }
  const validatedCryptoSet = new Set(validatedCryptoDiscovery);
  const discoveryUniverse = discoveryBase.filter(
    (sym) => !isCryptoDiscoverySymbol(sym) || validatedCryptoSet.has(sym),
  );

  const customUniverse = sanitizeSymbolList(commanderPrefs.customUniverseSymbols ?? []).filter((sym) => {
    const p = prefBySymbol.get(sym);
    return !(p?.ignored || p?.muted);
  });

  const holdingsUniverse = [
    ...new Set(
      accounts.flatMap((a) => a.holdings.map((h) => h.symbol.trim().toUpperCase()).filter(Boolean)),
    ),
  ];

  const symbolMetaMap = new Map<string, ScannerSymbolMeta>();
  const attachWatchMeta = (sym: string) => {
    const watch = watchMeta.get(sym);
    if (!watch) return;
    const prev = symbolMetaMap.get(sym);
    if (prev) {
      prev.inWatchlist = true;
      prev.watchlists = [...new Set([...prev.watchlists, ...watch.watchlists])];
      prev.pinned = prev.pinned || watch.pinned;
      prev.highPriority = prev.highPriority || watch.highPriority;
      prev.tags = [...new Set([...prev.tags, ...watch.tags])];
      prev.source = prev.inDiscovery ? "watchlist_discovery_match" : "watchlist";
      symbolMetaMap.set(sym, prev);
      return;
    }
    symbolMetaMap.set(sym, { ...watch, source: "watchlist" });
  };
  const attachDiscoveryMeta = (sym: string) => {
    const prev = symbolMetaMap.get(sym);
    if (prev) {
      prev.inDiscovery = true;
      prev.source = prev.inWatchlist ? "watchlist_discovery_match" : "ai_discovered";
      symbolMetaMap.set(sym, prev);
      return;
    }
    const pref = prefBySymbol.get(sym);
    symbolMetaMap.set(sym, {
      symbol: sym,
      exchange: pref?.exchange ?? "US",
      source: "ai_discovered",
      inWatchlist: false,
      inDiscovery: true,
      watchlists: [],
      pinned: pref?.pinned ?? false,
      highPriority: pref?.highPriority ?? false,
      muted: pref?.muted ?? false,
      ignored: pref?.ignored ?? false,
      tags: pref?.tags ?? [],
    });
  };

  let universeMode: ScannerSnapshot["universeMode"] = commanderPrefs.universeMode;
  let universe: string[] = [];
  let universeSource: ScannerSnapshot["universeSource"] = "none";

  const trimmed = symbol?.trim().toUpperCase();
  if (trimmed) {
    universe = [trimmed];
    universeSource = "explicit_symbol";
    const watch = watchMeta.get(trimmed);
    const pref = prefBySymbol.get(trimmed);
    symbolMetaMap.set(trimmed, {
      symbol: trimmed,
      exchange: watch?.exchange ?? pref?.exchange ?? "US",
      source: "explicit_symbol",
      inWatchlist: watch?.inWatchlist ?? false,
      inDiscovery: discoveryUniverse.includes(trimmed),
      watchlists: watch?.watchlists ?? [],
      pinned: watch?.pinned ?? pref?.pinned ?? false,
      highPriority: watch?.highPriority ?? pref?.highPriority ?? false,
      muted: false,
      ignored: false,
      tags: watch?.tags ?? pref?.tags ?? [],
    });
  } else if (commanderPrefs.universeMode === "WATCHLIST_ONLY") {
    universe = watchlistUniverse;
    universeSource = universe.length ? "watchlist" : "none";
    for (const sym of universe) attachWatchMeta(sym);
  } else if (commanderPrefs.universeMode === "AI_DISCOVERY_ONLY") {
    universe = discoveryUniverse;
    universeSource = universe.length ? "ai_discovery" : "none";
    for (const sym of universe) attachDiscoveryMeta(sym);
  } else if (commanderPrefs.universeMode === "CUSTOM_UNIVERSE") {
    universe = customUniverse;
    universeSource = universe.length ? "custom_universe" : "none";
    for (const sym of universe) {
      const p = prefBySymbol.get(sym);
      const w = watchMeta.get(sym);
      symbolMetaMap.set(sym, {
        symbol: sym,
        exchange: p?.exchange ?? w?.exchange ?? "US",
        source: "custom_universe",
        inWatchlist: Boolean(w),
        inDiscovery: false,
        watchlists: w?.watchlists ?? [],
        pinned: w?.pinned ?? p?.pinned ?? false,
        highPriority: w?.highPriority ?? p?.highPriority ?? false,
        muted: p?.muted ?? false,
        ignored: p?.ignored ?? false,
        tags: w?.tags ?? p?.tags ?? [],
      });
    }
  } else {
    const merged = [...new Set([...watchlistUniverse, ...discoveryUniverse])];
    universe = merged;
    if (watchlistUniverse.length && discoveryUniverse.length) {
      universeSource = "watchlist_plus_discovery";
    } else if (watchlistUniverse.length) {
      universeSource = "watchlist";
    } else if (discoveryUniverse.length) {
      universeSource = "ai_discovery";
    } else {
      universeSource = "none";
    }
    for (const sym of merged) {
      if (watchMeta.has(sym)) attachWatchMeta(sym);
      if (discoveryUniverse.includes(sym)) attachDiscoveryMeta(sym);
    }
  }

  if (!universe.length && holdingsUniverse.length) {
    universe = holdingsUniverse;
    universeSource = "portfolio_holdings";
    universeMode = "WATCHLIST_ONLY";
    for (const sym of holdingsUniverse) {
      const pref = prefBySymbol.get(sym);
      const w = watchMeta.get(sym);
      symbolMetaMap.set(sym, {
        symbol: sym,
        exchange: pref?.exchange ?? w?.exchange ?? "US",
        source: w ? "watchlist" : "ai_discovered",
        inWatchlist: Boolean(w),
        inDiscovery: false,
        watchlists: w?.watchlists ?? [],
        pinned: w?.pinned ?? pref?.pinned ?? false,
        highPriority: w?.highPriority ?? pref?.highPriority ?? false,
        muted: pref?.muted ?? false,
        ignored: pref?.ignored ?? false,
        tags: w?.tags ?? pref?.tags ?? [],
      });
    }
  }

  if (!universe.length) {
    telemetry?.({
      type: "log",
      level: "warn",
      message:
        "No symbols configured for current universe mode. Add watchlist/custom symbols or increase discovery universe size.",
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
    universeMode,
    watchlistUniverse,
    discoveryUniverse,
    customUniverse,
    symbolMeta: universe.map(
      (sym) =>
        symbolMetaMap.get(sym) ?? {
          symbol: sym,
          exchange: "US",
          source: "ai_discovered",
          inWatchlist: false,
          inDiscovery: true,
          watchlists: [],
          pinned: false,
          highPriority: false,
          muted: false,
          ignored: false,
          tags: [],
        },
    ),
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
