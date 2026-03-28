import type { AssetType, StrategyMode, SubPortfolioType } from "@prisma/client";
import type { ResolvedStrictProviders } from "@/lib/adapters/strict-providers";
import type { OptionChain } from "@/lib/adapters/types";
import { env } from "@/lib/env";
import {
  computeRankScore,
  daysUntilUtc,
  rankAndSplitCandidates,
  resolveStrategyViewTag,
} from "./candidate-ranking";
import { RiskEngine } from "./risk-engine";
import {
  buildProviderSnapshot,
  runOpenAIReasoning,
} from "./openai-reasoning";
import type { RiskParams } from "./risk-params";
import type { ScanTelemetryFn } from "@/lib/scan/types";

export const REASON = {
  MISSING_MARKET_ADAPTER: "MISSING_MARKET_ADAPTER",
  /** Entire `getQuote` returned null or unusable last price. */
  QUOTE_PROVIDER_NULL: "QUOTE_PROVIDER_NULL",
  /** @deprecated same as QUOTE_PROVIDER_NULL */
  MISSING_QUOTE: "QUOTE_PROVIDER_NULL",
  /**
   * Snapshot/JSON could not yield a valid last (distinct from null quote — e.g. corrupt field).
   */
  QUOTE_NORMALIZATION_FAILED: "QUOTE_NORMALIZATION_FAILED",
  INSUFFICIENT_CANDLE_HISTORY: "INSUFFICIENT_CANDLE_HISTORY",
  MISSING_STOCK_VOLUME: "MISSING_STOCK_VOLUME",
  STOCK_LIQUIDITY_RULE_FAIL: "STOCK_LIQUIDITY_RULE_FAIL",
  OPTIONS_MODULE_DISABLED_NO_POLYGON: "OPTIONS_MODULE_DISABLED_NO_POLYGON",
  OPTIONS_CHAIN_UNAVAILABLE: "OPTIONS_CHAIN_UNAVAILABLE",
  /** No option strike in the chain carried both bid and ask. */
  OPTIONS_CONTRACT_NBBO_MISSING: "OPTIONS_CONTRACT_NBBO_MISSING",
  /** Strikes have NBBO but spread / liquidity filters excluded all. */
  OPTIONS_SPREAD_TOO_WIDE: "OPTIONS_SPREAD_TOO_WIDE",
  /** @deprecated split into OPTIONS_CONTRACT_NBBO_MISSING | OPTIONS_SPREAD_TOO_WIDE */
  OPTIONS_NO_LIQUID_CONTRACT: "OPTIONS_NO_LIQUID_CONTRACT",
  EARNINGS_ADAPTER_MISSING: "EARNINGS_ADAPTER_MISSING",
  EARNINGS_DATE_UNAVAILABLE_FOR_SYMBOL: "EARNINGS_DATE_UNAVAILABLE_FOR_SYMBOL",
  SCORE_BELOW_THRESHOLD: "SCORE_BELOW_THRESHOLD",
  POSITION_SIZE_RULE_FAIL: "POSITION_SIZE_RULE_FAIL",
  OPENAI_REASONING_UNAVAILABLE: "OPENAI_REASONING_UNAVAILABLE",
  OPENAI_REASONING_FAILED: "OPENAI_REASONING_FAILED",
  OPENAI_DECISION_NO_TRADE: "OPENAI_DECISION_NO_TRADE",
  STOCK_MIN_PRICE_FAIL: "STOCK_MIN_PRICE_FAIL",
  STOCK_TREND_RULE_FAIL: "STOCK_TREND_RULE_FAIL",
  EARNINGS_PROXIMITY_FAIL: "EARNINGS_PROXIMITY_FAIL",
  /** No option strike passed spread + OI + volume + DTE filters. */
  OPTIONS_NO_QUALIFYING_STRIKE: "OPTIONS_NO_QUALIFYING_STRIKE",
} as const;

export type ReasonCode = (typeof REASON)[keyof typeof REASON];

export interface StrategyCandidate {
  symbol: string;
  exchange: string;
  assetType: AssetType;
  subPortfolio: SubPortfolioType;
  strategyTag: string;
  /** UI / analytics bucket: momentum_swing, options_momentum, defensive_setup, etc. */
  strategyViewTag: string;
  isEarningsPlay: boolean;
  proposedNotional: number;
  stopPrice?: number;
  targetNote: string;
  confidence: number;
  riskScore: number;
  thesis: string;
  invalidation: string;
  /** From model — expected holding horizon (e.g. days or weeks). */
  holdingPeriodNote: string;
  catalystSummary: string;
  rankScore: number;
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

export interface UniverseScanMeta {
  symbolsChecked: number;
  /** Symbols that passed all pre-OpenAI gates (may still lack API key). */
  passedToOpenAiGate: number;
  /** Completed OpenAI reasoning calls (success or structured failure). */
  openAiInvocations: number;
  stockCandidateCount: number;
  optionCandidateCount: number;
  tradeDecisionCount: number;
}

export interface UniverseScanResult {
  candidates: StrategyCandidate[];
  stockCandidates: StrategyCandidate[];
  optionCandidates: StrategyCandidate[];
  decisions: StrictDecisionRecord[];
  scanMeta: UniverseScanMeta;
}

function trendFromCandles(closes: number[]): number {
  if (closes.length < 10) return 0.5;
  const a = closes.slice(-5).reduce((s, x) => s + x, 0) / 5;
  const b = closes.slice(-10, -5).reduce((s, x) => s + x, 0) / 5;
  if (b <= 0) return 0.5;
  const r = (a - b) / b;
  return Math.max(0.35, Math.min(0.75, 0.5 + r * 3));
}

/** Tight option filters: NBBO, spread, OI, contract volume, DTE window. */
function pickQualifiedOption(
  chain: OptionChain,
  params: RiskParams,
): OptionChain["strikes"][0] | null {
  const now = Date.now();
  const ok = chain.strikes.filter((s) => {
    if (s.bid <= 0 || s.ask < s.bid) return false;
    const mid = (s.bid + s.ask) / 2;
    const sp = mid > 0 ? ((s.ask - s.bid) / mid) * 100 : 100;
    if (sp > params.maxBidAskSpreadPct) return false;
    const oi = s.openInterest ?? 0;
    if (oi < params.minOpenInterest) return false;
    const vol = s.volume ?? 0;
    if (vol < params.minOptionContractVolume) return false;
    const expMs = new Date(s.expiry).getTime();
    if (!Number.isFinite(expMs)) return false;
    const dte = (expMs - now) / 86400000;
    if (dte < params.optionMinDaysToExpiry || dte > params.optionMaxDaysToExpiry) {
      return false;
    }
    return true;
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
    telemetry?: ScanTelemetryFn,
  ): Promise<UniverseScanResult> {
    const emit = telemetry;
    const decisions: StrictDecisionRecord[] = [];
    const candidates: StrategyCandidate[] = [];
    let passedToOpenAiGate = 0;
    let openAiInvocations = 0;
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
      emit?.({
        type: "step",
        stepId: "fetch_quotes",
        status: "failed",
        label: "No market adapter",
      });
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
      return {
        candidates,
        stockCandidates: [],
        optionCandidates: [],
        decisions,
        scanMeta: {
          symbolsChecked: symbols.length,
          passedToOpenAiGate: 0,
          openAiInvocations: 0,
          stockCandidateCount: 0,
          optionCandidateCount: 0,
          tradeDecisionCount: 0,
        },
      };
    }

    emit?.({ type: "step", stepId: "fetch_quotes", status: "running" });
    emit?.({ type: "step", stepId: "earnings_window", status: earnings ? "running" : "skipped" });
    const upcoming = earnings ? await earnings.getUpcoming(14, symbols) : [];
    emit?.({
      type: "step",
      stepId: "earnings_window",
      status: earnings ? "done" : "skipped",
    });

    const candleFrom = new Date(Date.now() - 200 * 86400000);
    let openAiStepPhase: "idle" | "running" | "done" = "idle";

    for (const symbol of symbols) {
      const symStart = performance.now();
      try {
      const sourcesUsed: Record<string, string> = {};
      const sourcesMissing: string[] = [];
      const provenance = baseProvenance();

      emit?.({ type: "symbol_progress", symbol, phase: "fetching" });
      const tQuote = performance.now();
      const quote = await market.getQuote(symbol);
      emit?.({
        type: "timing",
        kind: "quote",
        symbol,
        ms: performance.now() - tQuote,
      });
      if (!quote) {
        decisions.push({
          timestamp: new Date().toISOString(),
          ticker: symbol,
          strategy: strategyLabel,
          decision: "NO_TRADE",
          reasonCode: REASON.QUOTE_PROVIDER_NULL,
          sourcesUsed,
          sourcesMissing: [...sourcesMissing, "QUOTE"],
          provenance,
        });
        continue;
      }
      if (!Number.isFinite(quote.last) || quote.last <= 0) {
        decisions.push({
          timestamp: new Date().toISOString(),
          ticker: symbol,
          strategy: strategyLabel,
          decision: "NO_TRADE",
          reasonCode: REASON.QUOTE_NORMALIZATION_FAILED,
          sourcesUsed: { ...sourcesUsed, quoteVendor: quote.source },
          sourcesMissing: [...sourcesMissing, "QUOTE_LAST_INVALID"],
          provenance,
        });
        continue;
      }
      sourcesUsed.quoteVendor = quote.source;

      const nbboObserved =
        quote.bid != null &&
        quote.ask != null &&
        quote.bid > 0 &&
        quote.ask >= quote.bid;

      const snapshotQuote: typeof quote = nbboObserved
        ? quote
        : { ...quote, bid: quote.last, ask: quote.last };

      if (!nbboObserved) {
        provenance.underlyingNbboObserved = "false";
        provenance.stockBidAskSource = quote.bidAskSource ?? null;
      } else {
        provenance.underlyingNbboObserved = "true";
        provenance.stockBidAskSource = quote.bidAskSource ?? "UNKNOWN";
      }

      const candles = await market.getCandles(symbol, "1d", candleFrom, new Date());
      if (candles.length < 5) {
        emit?.({
          type: "log",
          message: `${symbol} → limited candle history (${candles.length}); continuing with quote-led fallback`,
          symbol,
          level: "warn",
        });
      }
      sourcesUsed.candles = candles[0]?.source ?? quote.source;
      const closes = candles.length ? candles.map((c) => c.c) : [quote.last];
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

      const mid = (snapshotQuote.bid! + snapshotQuote.ask!) / 2;
      const spreadPct =
        nbboObserved && mid > 0
          ? ((snapshotQuote.ask! - snapshotQuote.bid!) / mid) * 100
          : 0;

      const stockLiq = nbboObserved
        ? this.risk.liquidityOk({
            avgVolume: quote.volume!,
            bid: quote.bid!,
            ask: quote.ask!,
          })
        : this.risk.liquidityOkStockVolumeOnly({ avgVolume: quote.volume! });
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

      const minPx = this.risk.stockMinPriceOk(quote.last);
      if (!minPx.ok) {
        decisions.push({
          timestamp: new Date().toISOString(),
          ticker: symbol,
          strategy: strategyLabel,
          decision: "NO_TRADE",
          reasonCode: REASON.STOCK_MIN_PRICE_FAIL,
          sourcesUsed,
          sourcesMissing,
          provenance: { ...provenance, minPriceNote: minPx.reason ?? null },
        });
        continue;
      }

      const trendGate = this.risk.stockTrendConfirmationOk(technicalTrend);
      if (!trendGate.ok) {
        decisions.push({
          timestamp: new Date().toISOString(),
          ticker: symbol,
          strategy: strategyLabel,
          decision: "NO_TRADE",
          reasonCode: REASON.STOCK_TREND_RULE_FAIL,
          sourcesUsed,
          sourcesMissing,
          provenance: { ...provenance, trendNote: trendGate.reason ?? null },
        });
        continue;
      }

      emit?.({
        type: "log",
        message: `${symbol} → passed stock filters`,
        symbol,
        level: "ok",
      });
      emit?.({ type: "symbol_progress", symbol, phase: "filtered" });

      const earnRow = upcoming.find(
        (e) => (e.symbol ?? "").toUpperCase() === symbol.toUpperCase(),
      );
      const daysUntilEarnings = daysUntilUtc(earnRow?.datetimeUtc);

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
        if (!earnRow) {
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
        const prox = this.risk.earningsProximityOk(daysUntilEarnings);
        if (!prox.ok) {
          emit?.({
            type: "log",
            message: `${symbol} → earnings proximity failed`,
            symbol,
            level: "warn",
          });
          decisions.push({
            timestamp: new Date().toISOString(),
            ticker: symbol,
            strategy: strategyLabel,
            decision: "NO_TRADE",
            reasonCode: REASON.EARNINGS_PROXIMITY_FAIL,
            sourcesUsed: { ...sourcesUsed, earnings: "FINNHUB" },
            sourcesMissing,
            provenance: {
              ...provenance,
              earningsProximityNote: prox.reason ?? null,
            },
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
        emit?.({
          type: "log",
          message: `${symbol} → fetching options chain`,
          symbol,
          level: "info",
        });
        chain = await options.getChain(symbol);
        if (!chain?.strikes.length) {
          emit?.({
            type: "log",
            message: `${symbol} → no Polygon chain returned`,
            symbol,
            level: "warn",
          });
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
        emit?.({
          type: "log",
          message: `${symbol} → options chain fetched`,
          symbol,
          level: "ok",
        });
        const strikesWithNbbo = chain.strikes.filter(
          (s) => s.bid > 0 && s.ask > 0 && s.ask >= s.bid,
        );
        if (!strikesWithNbbo.length) {
          emit?.({
            type: "log",
            message: `${symbol} → option strikes missing NBBO`,
            symbol,
            level: "warn",
          });
          decisions.push({
            timestamp: new Date().toISOString(),
            ticker: symbol,
            strategy: strategyLabel,
            decision: "NO_TRADE",
            reasonCode: REASON.OPTIONS_CONTRACT_NBBO_MISSING,
            sourcesUsed: { ...sourcesUsed, optionsChain: "POLYGON" },
            sourcesMissing: [...sourcesMissing, "OPTIONS_STRIKE_NBBO"],
            provenance,
          });
          continue;
        }
        const chainNbboOnly: OptionChain = { ...chain, strikes: strikesWithNbbo };
        bestOpt = pickQualifiedOption(chainNbboOnly, this.risk.params());
        if (!bestOpt) {
          emit?.({
            type: "log",
            message: `${symbol} → spread / liquidity filters rejected all strikes`,
            symbol,
            level: "warn",
          });
          decisions.push({
            timestamp: new Date().toISOString(),
            ticker: symbol,
            strategy: strategyLabel,
            decision: "NO_TRADE",
            reasonCode: REASON.OPTIONS_NO_QUALIFYING_STRIKE,
            sourcesUsed: { ...sourcesUsed, optionsChain: "POLYGON" },
            sourcesMissing,
            provenance,
          });
          continue;
        }
        emit?.({
          type: "log",
          message: `${symbol} ${bestOpt.right} ${bestOpt.strike} → liquid strike selected`,
          symbol,
          level: "ok",
        });
        sourcesUsed.optionsChain = "POLYGON";
      }

      const articles = news ? await news.getNews(symbol, 12) : [];
      const newsSkipped = !news || articles.length === 0;
      if (news) sourcesUsed.news = "FINNHUB";
      else sourcesMissing.push("NEWS_ADAPTER");
      if (news && articles.length === 0) sourcesMissing.push("NEWS_HEADLINES_EMPTY");

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

      const isEarn =
        earnRow != null &&
        daysUntilEarnings != null &&
        daysUntilEarnings >= 0;

      passedToOpenAiGate++;
      if (!env.OPENAI_API_KEY) {
        emit?.({
          type: "log",
          message: `${symbol} → OpenAI unavailable (no API key)`,
          symbol,
          level: "warn",
        });
        decisions.push({
          timestamp: new Date().toISOString(),
          ticker: symbol,
          strategy: strategyLabel,
          decision: "NO_TRADE",
          reasonCode: REASON.OPENAI_REASONING_UNAVAILABLE,
          sourcesUsed,
          sourcesMissing: [...sourcesMissing, "OPENAI_API_KEY"],
          provenance,
        });
        continue;
      }

      const model = env.OPENAI_REASONING_MODEL?.trim() || "gpt-4o-mini";
      const snapshot = buildProviderSnapshot({
        symbol,
        mode: this.mode,
        subPortfolio,
        portfolioValue,
        provenance: { ...provenance },
        quote: snapshotQuote,
        underlyingNbboObserved: nbboObserved,
        spreadPct,
        candles,
        fundamentals,
        earningsInWindow: isEarn,
        earningsCalendarVendor: earnings ? "FINNHUB" : null,
        articles,
        newsSkipped,
        newsAdapterPresent: Boolean(news),
        web,
        bestOpt,
        optionsMode: this.mode === "OPTIONS_MOMENTUM",
        risk: this.risk.params(),
        technicalTrend,
        liquidityCheckPassed: true,
      });

      if (openAiStepPhase === "idle") {
        openAiStepPhase = "running";
        emit?.({ type: "step", stepId: "openai", status: "running" });
      }
      emit?.({ type: "openai_start", symbol });
      emit?.({ type: "symbol_progress", symbol, phase: "openai" });
      emit?.({
        type: "log",
        message: `OpenAI evaluating ${symbol}…`,
        symbol,
        level: "info",
      });

      const tAi = performance.now();
      const ai = await runOpenAIReasoning(env.OPENAI_API_KEY, model, snapshot);
      emit?.({
        type: "timing",
        kind: "openai",
        symbol,
        ms: performance.now() - tAi,
      });
      openAiInvocations++;
      if (!ai.ok) {
        emit?.({
          type: "log",
          message: `${symbol} → OpenAI request failed`,
          symbol,
          level: "error",
        });
        decisions.push({
          timestamp: new Date().toISOString(),
          ticker: symbol,
          strategy: strategyLabel,
          decision: "NO_TRADE",
          reasonCode: REASON.OPENAI_REASONING_FAILED,
          sourcesUsed: {
            ...sourcesUsed,
            reasoningLayer: "OPENAI",
            openaiModel: model,
            openaiError: ai.error.slice(0, 500),
          },
          sourcesMissing,
          provenance,
        });
        continue;
      }

      sourcesUsed.reasoningLayer = "OPENAI";
      sourcesUsed.openaiModel = model;

      if (ai.output.decision === "NO_TRADE") {
        emit?.({
          type: "openai_result",
          symbol,
          decision: "NO_TRADE",
          confidence: ai.output.confidence,
          no_trade_reason: ai.output.no_trade_reason,
        });
        emit?.({
          type: "log",
          message: `${symbol} → NO_TRADE confidence ${ai.output.confidence.toFixed(1)}`,
          symbol,
          level: "warn",
        });
        decisions.push({
          timestamp: new Date().toISOString(),
          ticker: symbol,
          strategy: strategyLabel,
          decision: "NO_TRADE",
          reasonCode: REASON.OPENAI_DECISION_NO_TRADE,
          sourcesUsed,
          sourcesMissing,
          provenance: {
            ...provenance,
            openaiNoTradeReason: ai.output.no_trade_reason || null,
          },
        });
        continue;
      }

      emit?.({
        type: "openai_result",
        symbol,
        decision: "TRADE",
        confidence: ai.output.confidence,
      });
      emit?.({
        type: "log",
        message: `${symbol} → TRADE confidence ${ai.output.confidence.toFixed(1)}`,
        symbol,
        level: "ok",
      });

      const proposedNotional = Math.min(
        portfolioValue * 0.08,
        portfolioValue * (this.risk.params().maxPositionPct / 100),
      );
      const sz = this.risk.positionSizeNotional(portfolioValue, proposedNotional);
      if (!sz.ok) {
        emit?.({
          type: "log",
          message: `${symbol} → position size rule failed`,
          symbol,
          level: "warn",
        });
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

      const snapshotForLog = {
        ...snapshot,
        candles_daily: {
          ...snapshot.candles_daily,
          recent_bars_desc: snapshot.candles_daily.recent_bars_desc.slice(0, 8),
        },
        news: {
          ...snapshot.news,
          items: snapshot.news.items.slice(0, 6),
        },
      };

      const assetType: AssetType =
        this.mode === "OPTIONS_MOMENTUM" && bestOpt ? "OPTION" : "STOCK";

      const targetNote =
        assetType === "OPTION" && bestOpt
          ? `Option idea (Polygon chain): ${bestOpt.right} ${bestOpt.strike} exp ${bestOpt.expiry}.`
          : "Swing / momentum — trail stops after +1R.";

      const strategyViewTag = resolveStrategyViewTag({
        mode: this.mode,
        isEarningsPlay: isEarn,
        daysUntilEarnings,
      });

      const rankScore = computeRankScore({
        confidence: ai.output.confidence,
        riskScore: ai.output.risk_score,
        underlyingNbboObserved: nbboObserved,
        spreadPct,
        avgDailyVolume: quote.volume!,
        isEarningsPlay: isEarn,
        daysUntilEarnings,
        assetType,
      });

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
        strategyViewTag,
        isEarningsPlay: isEarn,
        proposedNotional,
        stopPrice: snapshotQuote.last * (assetType === "OPTION" ? 0.5 : 0.94),
        targetNote,
        confidence: ai.output.confidence,
        riskScore: ai.output.risk_score,
        thesis: ai.output.thesis,
        invalidation: ai.output.invalidation,
        holdingPeriodNote: ai.output.holding_period_note,
        catalystSummary: ai.output.catalyst_summary,
        rankScore,
        facts: {
          last: quote.last,
          underlyingNbboObserved: nbboObserved,
          stockBidAskSource: quote.bidAskSource ?? null,
          spreadPct,
          volume: quote.volume,
          provenance: {
            quotes: quote.source,
            candles: candles[0]?.source ?? quote.source,
            fundamentals: fundamentals?.source ?? null,
            earningsCalendar: earnings ? "FINNHUB" : null,
            news: news ? "FINNHUB" : null,
            optionsChain:
              this.mode === "OPTIONS_MOMENTUM" ? "POLYGON" : "NOT_USED",
            webResearch: web.source,
            reasoning: "OPENAI",
          },
          fundamentalsFromVendor: fundFromVendor,
          newsSkipped,
          openaiModel: model,
          openaiRationale: ai.output.rationale,
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
          daysUntilEarnings,
          strategyViewTag,
          rankScore,
        },
        inferences: {
          openaiStructuredOutput: ai.output,
          openaiRawJson: ai.rawContent,
          providerSnapshotSentToOpenAI: snapshotForLog,
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
      } finally {
        emit?.({
          type: "timing",
          kind: "symbol",
          symbol,
          ms: performance.now() - symStart,
        });
        emit?.({ type: "symbol_progress", symbol, phase: "completed" });
      }
    }

    emit?.({ type: "step", stepId: "fetch_quotes", status: "done" });
    emit?.({
      type: "step",
      stepId: "options_chain",
      status: this.mode === "OPTIONS_MOMENTUM" ? "done" : "skipped",
    });
    emit?.({ type: "step", stepId: "liquidity_filters", status: "done" });
    if (openAiStepPhase === "running") {
      emit?.({ type: "step", stepId: "openai", status: "done" });
      openAiStepPhase = "done";
    } else {
      emit?.({ type: "step", stepId: "openai", status: "skipped" });
    }
    emit?.({ type: "step", stepId: "ranking", status: "running" });

    const { ranked, stocks, options: rankedOptions } = rankAndSplitCandidates(candidates);
    const cap = 8;
    const stockSlice = stocks.slice(0, cap);
    const optionSlice = rankedOptions.slice(0, cap);

    emit?.({ type: "step", stepId: "ranking", status: "done" });
    emit?.({
      type: "step",
      stepId: "trade_journal",
      status: "skipped",
      label: "Logged by scan worker / cron",
    });
    emit?.({
      type: "step",
      stepId: "alerts",
      status: "skipped",
      label: "Sent when worker executes TRADE + your alert threshold",
    });

    return {
      candidates: ranked.slice(0, cap),
      stockCandidates: stockSlice,
      optionCandidates: optionSlice,
      decisions,
      scanMeta: {
        symbolsChecked: symbols.length,
        passedToOpenAiGate,
        openAiInvocations,
        stockCandidateCount: stockSlice.length,
        optionCandidateCount: optionSlice.length,
        tradeDecisionCount: decisions.filter((d) => d.decision === "TRADE").length,
      },
    };
  }
}
