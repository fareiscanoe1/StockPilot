import type { AssetType, StrategyMode, SubPortfolioType } from "@prisma/client";
import type { ResolvedStrictProviders } from "@/lib/adapters/strict-providers";
import type { OptionChain } from "@/lib/adapters/types";
import { RiskEngine } from "./risk-engine";
import { scoreOpportunity, type FactorInputs } from "./scoring";

export const REASON = {
  MISSING_MARKET_ADAPTER: "MISSING_MARKET_ADAPTER",
  MISSING_QUOTE: "MISSING_QUOTE",
  MISSING_REAL_BID_ASK: "MISSING_REAL_BID_ASK",
  INSUFFICIENT_CANDLE_HISTORY: "INSUFFICIENT_CANDLE_HISTORY",
  MISSING_STOCK_VOLUME: "MISSING_STOCK_VOLUME",
  STOCK_LIQUIDITY_RULE_FAIL: "STOCK_LIQUIDITY_RULE_FAIL",
  OPTIONS_MODULE_DISABLED_NO_POLYGON: "OPTIONS_MODULE_DISABLED_NO_POLYGON",
  OPTIONS_CHAIN_UNAVAILABLE: "OPTIONS_CHAIN_UNAVAILABLE",
  OPTIONS_NO_LIQUID_CONTRACT: "OPTIONS_NO_LIQUID_CONTRACT",
  EARNINGS_ADAPTER_MISSING: "EARNINGS_ADAPTER_MISSING",
  EARNINGS_DATE_UNAVAILABLE_FOR_SYMBOL: "EARNINGS_DATE_UNAVAILABLE_FOR_SYMBOL",
  SCORE_BELOW_THRESHOLD: "SCORE_BELOW_THRESHOLD",
  POSITION_SIZE_RULE_FAIL: "POSITION_SIZE_RULE_FAIL",
} as const;

export type ReasonCode = (typeof REASON)[keyof typeof REASON];

export interface StrategyCandidate {
  symbol: string;
  exchange: string;
  assetType: AssetType;
  subPortfolio: SubPortfolioType;
  strategyTag: string;
  isEarningsPlay: boolean;
  proposedNotional: number;
  stopPrice?: number;
  targetNote: string;
  confidence: number;
  riskScore: number;
  thesis: string;
  invalidation: string;
  facts: Record<string, unknown>;
  inferences: Record<string, unknown>;
}

export interface StrictDecisionRecord {
  timestamp: string;
  ticker: string;
  strategy: string;
  decision: "TRADE" | "NO_TRADE";
  reasonCode: ReasonCode | null;
  sourcesUsed: Record<string, string>;
  sourcesMissing: string[];
  provenance: Record<string, string | null>;
}

export interface UniverseScanResult {
  candidates: StrategyCandidate[];
  decisions: StrictDecisionRecord[];
}

function trendFromCandles(closes: number[]): number {
  if (closes.length < 10) return 0.5;
  const a = closes.slice(-5).reduce((s, x) => s + x, 0) / 5;
  const b = closes.slice(-10, -5).reduce((s, x) => s + x, 0) / 5;
  if (b <= 0) return 0.5;
  const r = (a - b) / b;
  return Math.max(0.35, Math.min(0.75, 0.5 + r * 3));
}

function pickLiquidOption(
  chain: OptionChain,
  maxSpreadPct: number,
): OptionChain["strikes"][0] | null {
  const ok = chain.strikes.filter((s) => {
    const mid = (s.bid + s.ask) / 2;
    const sp = mid > 0 ? ((s.ask - s.bid) / mid) * 100 : 100;
    return sp <= maxSpreadPct && s.bid > 0 && s.ask > 0;
  });
  if (!ok.length) return null;
  return ok.sort(
    (a, b) =>
      (b.openInterest ?? 0) + (b.volume ?? 0) - ((a.openInterest ?? 0) + (a.volume ?? 0)),
  )[0]!;
}

/** STRICT_REAL_DATA_ONLY — no mock paths; every path logs sources or NO_TRADE. */
export class StrictStrategyEngine {
  constructor(
    private mode: StrategyMode,
    private providers: ResolvedStrictProviders,
    private risk: RiskEngine,
  ) {}

  async scanUniverse(
    symbols: string[],
    portfolioValue: number,
    subPortfolio: SubPortfolioType,
  ): Promise<UniverseScanResult> {
    const decisions: StrictDecisionRecord[] = [];
    const candidates: StrategyCandidate[] = [];
    const { market, options, earnings, news, research, stack } = this.providers;
    const strategyLabel =
      this.mode === "EARNINGS_HUNTER"
        ? "earnings_hunter"
        : this.mode === "OPTIONS_MOMENTUM"
          ? "options_momentum"
          : "multi_factor_swing";

    const baseProvenance = (): Record<string, string | null> => ({
      quotes: stack.quotesSource,
      candles: stack.candlesSource,
      fundamentals: stack.fundamentalsSource,
      earningsCalendar: stack.earningsSource,
      news: stack.newsSource,
      optionsChain: stack.optionsSource,
      webResearch: stack.webResearchSource,
    });

    if (!market) {
      for (const ticker of symbols) {
        decisions.push({
          timestamp: new Date().toISOString(),
          ticker,
          strategy: strategyLabel,
          decision: "NO_TRADE",
          reasonCode: REASON.MISSING_MARKET_ADAPTER,
          sourcesUsed: {},
          sourcesMissing: ["MARKET_ADAPTER", "QUOTES", "CANDLES"],
          provenance: baseProvenance(),
        });
      }
      return { candidates, decisions };
    }

    const upcoming = earnings ? await earnings.getUpcoming(14, symbols) : [];
    const earningsSet = new Set(
      upcoming.map((e) => (e.symbol ?? "").toUpperCase()),
    );

    const candleFrom = new Date(Date.now() - 200 * 86400000);

    for (const symbol of symbols) {
      const sourcesUsed: Record<string, string> = {};
      const sourcesMissing: string[] = [];
      const provenance = baseProvenance();

      const quote = await market.getQuote(symbol);
      if (!quote) {
        decisions.push({
          timestamp: new Date().toISOString(),
          ticker: symbol,
          strategy: strategyLabel,
          decision: "NO_TRADE",
          reasonCode: REASON.MISSING_QUOTE,
          sourcesUsed,
          sourcesMissing: [...sourcesMissing, "QUOTE"],
          provenance,
        });
        continue;
      }
      sourcesUsed.quoteVendor = quote.source;

      if (
        quote.bid == null ||
        quote.ask == null ||
        quote.bid <= 0 ||
        quote.ask < quote.bid
      ) {
        decisions.push({
          timestamp: new Date().toISOString(),
          ticker: symbol,
          strategy: strategyLabel,
          decision: "NO_TRADE",
          reasonCode: REASON.MISSING_REAL_BID_ASK,
          sourcesUsed,
          sourcesMissing: [...sourcesMissing, "BID_ASK_QUOTE"],
          provenance,
        });
        continue;
      }

      const candles = await market.getCandles(symbol, "1d", candleFrom, new Date());
      if (candles.length < 5) {
        decisions.push({
          timestamp: new Date().toISOString(),
          ticker: symbol,
          strategy: strategyLabel,
          decision: "NO_TRADE",
          reasonCode: REASON.INSUFFICIENT_CANDLE_HISTORY,
          sourcesUsed: { ...sourcesUsed, candles: candles[0]?.source ?? quote.source },
          sourcesMissing,
          provenance,
        });
        continue;
      }
      sourcesUsed.candles = candles[0]!.source;
      const closes = candles.map((c) => c.c);
      const technicalTrend = trendFromCandles(closes);

      if (quote.volume == null || quote.volume <= 0) {
        decisions.push({
          timestamp: new Date().toISOString(),
          ticker: symbol,
          strategy: strategyLabel,
          decision: "NO_TRADE",
          reasonCode: REASON.MISSING_STOCK_VOLUME,
          sourcesUsed,
          sourcesMissing: [...sourcesMissing, "REAL_VOLUME"],
          provenance,
        });
        continue;
      }

      const mid = (quote.bid + quote.ask) / 2;
      const spreadPct = mid > 0 ? ((quote.ask - quote.bid) / mid) * 100 : 0;

      const stockLiq = this.risk.liquidityOk({
        avgVolume: quote.volume,
        bid: quote.bid,
        ask: quote.ask,
      });
      if (!stockLiq.ok) {
        decisions.push({
          timestamp: new Date().toISOString(),
          ticker: symbol,
          strategy: strategyLabel,
          decision: "NO_TRADE",
          reasonCode: REASON.STOCK_LIQUIDITY_RULE_FAIL,
          sourcesUsed,
          sourcesMissing,
          provenance: { ...provenance, liquidityNote: stockLiq.reason ?? null },
        });
        continue;
      }

      if (this.mode === "EARNINGS_HUNTER") {
        if (!earnings) {
          decisions.push({
            timestamp: new Date().toISOString(),
            ticker: symbol,
            strategy: strategyLabel,
            decision: "NO_TRADE",
            reasonCode: REASON.EARNINGS_ADAPTER_MISSING,
            sourcesUsed,
            sourcesMissing: [...sourcesMissing, "EARNINGS_CALENDAR"],
            provenance,
          });
          continue;
        }
        if (!earningsSet.has(symbol.toUpperCase())) {
          decisions.push({
            timestamp: new Date().toISOString(),
            ticker: symbol,
            strategy: strategyLabel,
            decision: "NO_TRADE",
            reasonCode: REASON.EARNINGS_DATE_UNAVAILABLE_FOR_SYMBOL,
            sourcesUsed: { ...sourcesUsed, earnings: "FINNHUB" },
            sourcesMissing,
            provenance,
          });
          continue;
        }
        sourcesUsed.earningsCalendar = "FINNHUB";
      }

      let chain: OptionChain | null = null;
      let bestOpt: OptionChain["strikes"][0] | null = null;

      if (this.mode === "OPTIONS_MOMENTUM") {
        if (!options) {
          decisions.push({
            timestamp: new Date().toISOString(),
            ticker: symbol,
            strategy: strategyLabel,
            decision: "NO_TRADE",
            reasonCode: REASON.OPTIONS_MODULE_DISABLED_NO_POLYGON,
            sourcesUsed,
            sourcesMissing: [...sourcesMissing, "POLYGON_OPTIONS"],
            provenance,
          });
          continue;
        }
        chain = await options.getChain(symbol);
        if (!chain?.strikes.length) {
          decisions.push({
            timestamp: new Date().toISOString(),
            ticker: symbol,
            strategy: strategyLabel,
            decision: "NO_TRADE",
            reasonCode: REASON.OPTIONS_CHAIN_UNAVAILABLE,
            sourcesUsed,
            sourcesMissing: [...sourcesMissing, "OPTIONS_CHAIN"],
            provenance,
          });
          continue;
        }
        bestOpt = pickLiquidOption(chain, this.risk.params().maxBidAskSpreadPct);
        if (!bestOpt) {
          decisions.push({
            timestamp: new Date().toISOString(),
            ticker: symbol,
            strategy: strategyLabel,
            decision: "NO_TRADE",
            reasonCode: REASON.OPTIONS_NO_LIQUID_CONTRACT,
            sourcesUsed: { ...sourcesUsed, optionsChain: "POLYGON" },
            sourcesMissing,
            provenance,
          });
          continue;
        }
        sourcesUsed.optionsChain = "POLYGON";
      }

      const articles = news ? await news.getNews(symbol, 12) : [];
      const newsSkipped = !news || articles.length === 0;
      if (news) sourcesUsed.news = "FINNHUB";
      else sourcesMissing.push("NEWS_ADAPTER");
      if (news && articles.length === 0) sourcesMissing.push("NEWS_HEADLINES_EMPTY");

      const sent = newsSkipped
        ? 0
        : articles.reduce((a, n) => a + (n.sentiment ?? 0), 0) / articles.length;

      const web = await research.gatherSymbolContext(symbol);
      sourcesUsed.webResearchLayer = web.source;
      provenance.webResearch = web.source;

      const fundamentals = await market.getFundamentals(symbol);
      const fundFromVendor = Boolean(
        fundamentals &&
          (fundamentals.pe != null ||
            fundamentals.marketCap != null ||
            fundamentals.debtToEquity != null),
      );
      if (!fundamentals) sourcesMissing.push("FUNDAMENTALS_SNAPSHOT");
      else sourcesUsed.fundamentals = fundamentals.source;

      const isEarn = earningsSet.has(symbol.toUpperCase());

      const optQuality =
        this.mode === "OPTIONS_MOMENTUM" && bestOpt
          ? Math.min(
              1,
              ((bestOpt.openInterest ?? 0) / 5000) * 0.5 +
                (1 - Math.min(1, spreadPct / 5)) * 0.5,
            )
          : 0.45;

      const factors: FactorInputs = {
        technicalTrend,
        momentum: quote.volume > 2e6 ? 0.62 : 0.5,
        earningsEdge:
          this.mode === "EARNINGS_HUNTER" && isEarn
            ? 0.72
            : this.mode === "EARNINGS_HUNTER"
              ? 0.35
              : isEarn
                ? 0.55
                : 0.45,
        valuationZ: fundamentals?.pe
          ? Math.max(0, 1 - Math.min(1, fundamentals.pe / 40))
          : 0.5,
        balanceSheet: fundamentals?.debtToEquity
          ? Math.max(0, 1 - fundamentals.debtToEquity)
          : 0.5,
        newsSentiment: sent,
        newsSkipped,
        optionsQuality: optQuality,
        optionsSkipped: this.mode !== "OPTIONS_MOMENTUM",
        portfolioFit: 0.6,
        macroRisk:
          isEarn && !this.risk.params().allowHighEventRisk ? 0.55 : 0.35,
      };

      const scored = scoreOpportunity(this.mode, factors);
      if (!scored.trade) {
        decisions.push({
          timestamp: new Date().toISOString(),
          ticker: symbol,
          strategy: strategyLabel,
          decision: "NO_TRADE",
          reasonCode: REASON.SCORE_BELOW_THRESHOLD,
          sourcesUsed,
          sourcesMissing,
          provenance,
        });
        continue;
      }

      const proposedNotional = Math.min(
        portfolioValue * 0.08,
        portfolioValue * (this.risk.params().maxPositionPct / 100),
      );
      const sz = this.risk.positionSizeNotional(portfolioValue, proposedNotional);
      if (!sz.ok) {
        decisions.push({
          timestamp: new Date().toISOString(),
          ticker: symbol,
          strategy: strategyLabel,
          decision: "NO_TRADE",
          reasonCode: REASON.POSITION_SIZE_RULE_FAIL,
          sourcesUsed,
          sourcesMissing,
          provenance,
        });
        continue;
      }

      const assetType: AssetType =
        this.mode === "OPTIONS_MOMENTUM" && bestOpt ? "OPTION" : "STOCK";

      const targetNote =
        assetType === "OPTION" && bestOpt
          ? `Simulated option (Polygon chain): ${bestOpt.right} ${bestOpt.strike} exp ${bestOpt.expiry}.`
          : "Swing / momentum — trail stops after +1R.";

      const candidate: StrategyCandidate = {
        symbol,
        exchange: quote.exchange,
        assetType,
        subPortfolio,
        strategyTag:
          this.mode === "EARNINGS_HUNTER"
            ? "earnings_momentum"
            : this.mode === "OPTIONS_MOMENTUM"
              ? "options_momentum"
              : "multi_factor_swing",
        isEarningsPlay: isEarn,
        proposedNotional,
        stopPrice: quote.last * (assetType === "OPTION" ? 0.5 : 0.94),
        targetNote,
        confidence: scored.confidence,
        riskScore: scored.riskScore,
        thesis: scored.thesis,
        invalidation: scored.invalidation,
        facts: {
          last: quote.last,
          spreadPct,
          volume: quote.volume,
          provenance: {
            quotes: quote.source,
            candles: candles[0]!.source,
            fundamentals: fundamentals?.source ?? null,
            earningsCalendar: earnings ? "FINNHUB" : null,
            news: news ? "FINNHUB" : null,
            optionsChain:
              this.mode === "OPTIONS_MOMENTUM" ? "POLYGON" : "NOT_USED",
            webResearch: web.source,
          },
          fundamentalsFromVendor: fundFromVendor,
          newsSkipped,
          webResearchOpenWebOnly: {
            label:
              "Supplemental open-web research — not market data; verify sources.",
            source: web.source,
            query: web.query,
            titles: web.snippets.map((s) => s.title).slice(0, 5),
            urls: web.snippets.map((s) => s.url).filter(Boolean).slice(0, 5),
          },
          newsHeadlines: articles.slice(0, 6).map((a) => ({
            headline: a.headline,
            source: a.source,
            url: a.url,
          })),
          earningsScheduled: isEarn,
        },
        inferences: {
          scored,
          newsHeadlineSample: articles[0]?.headline,
          fundamentalsSnapshot: fundamentals,
        },
      };

      candidates.push(candidate);
      decisions.push({
        timestamp: new Date().toISOString(),
        ticker: symbol,
        strategy: strategyLabel,
        decision: "TRADE",
        reasonCode: null,
        sourcesUsed,
        sourcesMissing,
        provenance,
      });
    }

    candidates.sort((a, b) => b.confidence - a.confidence);
    return { candidates: candidates.slice(0, 8), decisions };
  }
}
