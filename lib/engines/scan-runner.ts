import prisma from "@/lib/db";
import { getResolvedStrictProviders } from "@/lib/adapters/provider-factory";
import { RiskEngine } from "./risk-engine";
import { StrictStrategyEngine } from "./strategy-engine";
import { PortfolioSimulator } from "./portfolio-simulator";
import { AlertEngine } from "./alert-engine";
import { TradeJournal } from "./trade-journal";
import { SimulatedAction } from "@prisma/client";
import { parseCommanderFromCustomRules } from "@/lib/commander/prefs";
import { buildDiscoveryUniverse, sanitizeSymbolList } from "@/lib/commander/discovery-universe";
import { ensureDefaultWatchlists } from "@/lib/watchlist/defaults";
import { findManySymbolPreferences } from "@/lib/symbol-preferences";

/** Called from API cron / worker — runs one scan cycle per virtual account. */
export class ScanRunner {
  async runForUser(userId: string) {
    const profile = await prisma.strategyProfile.findUnique({ where: { userId } });
    const mode = profile?.mode ?? "BALANCED";
    const commanderPrefs = parseCommanderFromCustomRules(profile?.customRules, mode);
    const riskOverrides = profile?.riskParams as object | undefined;

    const providers = getResolvedStrictProviders();
    const risk = new RiskEngine(mode, riskOverrides as never);
    const strategy = new StrictStrategyEngine(mode, providers, risk);
    const alerter = new AlertEngine();
    const notifyPrefs = await prisma.notificationPreference.findUnique({
      where: { userId },
    });

    const accounts = await prisma.virtualAccount.findMany({
      where: { userId },
      include: { holdings: true },
    });
    await ensureDefaultWatchlists(userId);
    const watch = await prisma.watchlistSymbol.findMany({
      where: { watchlist: { userId } },
    });
    const symbolPrefs = await findManySymbolPreferences(userId);
    const mutedOrIgnored = new Set(
      symbolPrefs
        .filter((p) => p.muted || p.ignored)
        .map((p) => p.symbol.trim().toUpperCase()),
    );
    const symbols = [
      ...new Set(
        watch
          .map((w) => w.symbol.trim().toUpperCase())
          .filter((sym) => sym && !mutedOrIgnored.has(sym)),
      ),
    ];
    const holdingSymbols = [
      ...new Set(
        accounts
          .flatMap((a) => a.holdings.map((h) => h.symbol.trim().toUpperCase()))
          .filter(Boolean),
      ),
    ];
    const discoverySymbols = buildDiscoveryUniverse({
      primaryMode: commanderPrefs.primaryMode,
      size: commanderPrefs.discoveryUniverseSize,
      optionsEnabled: commanderPrefs.toggles.optionsEnabled,
      cryptoEnabled: commanderPrefs.toggles.cryptoEnabled,
    }).filter((sym) => !mutedOrIgnored.has(sym));
    const customSymbols = sanitizeSymbolList(commanderPrefs.customUniverseSymbols ?? []).filter(
      (sym) => !mutedOrIgnored.has(sym),
    );
    const universe =
      commanderPrefs.universeMode === "WATCHLIST_ONLY"
        ? symbols
        : commanderPrefs.universeMode === "AI_DISCOVERY_ONLY"
          ? discoverySymbols
          : commanderPrefs.universeMode === "CUSTOM_UNIVERSE"
            ? customSymbols
            : [...new Set([...symbols, ...discoverySymbols])];
    const finalUniverse = universe.length ? universe : holdingSymbols;

    if (providers.stack.warnings.length) {
      console.warn(
        "[STRICT] Provider warnings:",
        providers.stack.warnings.join(" | "),
      );
    }
    if (!finalUniverse.length) {
      console.warn(
        "[STRICT] ScanRunner: no symbols configured for selected universe mode; skipping user",
        userId,
      );
      return;
    }
    if (!providers.market) {
      console.warn(
        "[STRICT] ScanRunner: no market adapter — no simulated buy executions.",
      );
    }

    for (const acc of accounts) {
      const marks: Record<string, number> = {};
      const markSymbols = [
        ...new Set([...finalUniverse, ...acc.holdings.map((h) => h.symbol.trim().toUpperCase())]),
      ];
      if (providers.market) {
        for (const s of markSymbols) {
          const q = await providers.market.getQuote(s);
          if (q) marks[s] = q.last;
        }
      }
      const pv = await PortfolioSimulator.portfolioValue(acc.id, marks);
      const gross = acc.holdings.reduce(
        (s, h) => s + Number(h.quantity) * (marks[h.symbol] ?? Number(h.avgCost)),
        0,
      );
      if (!risk.heatOk(gross, pv)) continue;

      const { candidates, decisions } = await strategy.scanUniverse(
        finalUniverse,
        pv,
        acc.subPortfolio,
      );

      const minConf =
        notifyPrefs?.minTradeAlertConfidence != null
          ? Number(notifyPrefs.minTradeAlertConfidence)
          : null;
      const requireHighConviction = notifyPrefs?.alertsHighConvictionOnly === true;

      for (const d of decisions) {
        const candidate =
          d.decision === "TRADE"
            ? candidates.find((c) => c.symbol === d.ticker)
            : undefined;
        await TradeJournal.logStrictDecision(userId, acc.id, d, candidate);
      }

      const top = candidates[0];
      if (!top) continue;
      const tradeOk = decisions.some(
        (d) => d.ticker === top.symbol && d.decision === "TRADE",
      );
      if (!tradeOk) continue;

      if (minConf != null && top.confidence < minConf) continue;
      if (requireHighConviction && top.confidence < 7) continue;

      if (!providers.market) continue;
      const quote = await providers.market.getQuote(top.symbol);
      if (!quote) continue;
      const px = quote.last;
      const qty =
        top.assetType === "OPTION"
          ? Math.max(1, Math.floor(top.proposedNotional / (px * 100)))
          : Math.max(1, Math.floor(top.proposedNotional / px));

      const order = await PortfolioSimulator.execute({
        virtualAccountId: acc.id,
        candidate: top,
        quantity: qty,
        fillPrice: px,
        action: SimulatedAction.BUY,
      });

      const prov = top.facts.provenance as Record<string, string | null> | undefined;

      await alerter.notifyTrade(userId, {
        ticker: top.symbol,
        assetType: top.assetType,
        action: SimulatedAction.BUY,
        entryPrice: px,
        size: qty,
        stopLoss: top.stopPrice,
        targetOrExit: top.targetNote,
        confidence: top.confidence,
        strategyTag: top.strategyTag,
        reason: top.thesis,
        isEarningsRelated: top.isEarningsPlay,
        timestamp: new Date().toISOString(),
        dataProvenance: prov,
      });

      await prisma.auditLog.create({
        data: {
          userId,
          action: "SCAN_EXECUTE_SIMULATED",
          meta: { orderId: order.id, symbol: top.symbol },
        },
      });
    }
  }
}
