/**
 * STRICT_REAL_DATA_ONLY — no mock, no synthetic market data, no silent downgrade.
 */
import { env } from "@/lib/env";
import {
  FinnhubMarketDataAdapter,
  PolygonMarketDataAdapter,
  PolygonPrimaryFinnhubFallbackMarketAdapter,
  type MarketDataAdapter,
} from "./market-data-adapter";
import { PolygonOptionsDataAdapter, type OptionsDataAdapter } from "./options-data-adapter";
import { FinnhubEarningsDataAdapter, type EarningsDataAdapter } from "./earnings-data-adapter";
import { FinnhubLiveNewsAdapter, type NewsAdapter } from "./news-adapter";
import { SkippedWebResearchAdapter, TavilyResearchAdapter, type ResearchAdapter } from "./research-adapter";

export type QuotesSource = "POLYGON" | "POLYGON_WITH_FINNHUB_FALLBACK" | "FINNHUB" | null;
export type OptionsSource = "POLYGON" | null;
export type EarningsSource = "FINNHUB" | null;
export type NewsSource = "FINNHUB" | null;
export type WebResearchSource = "TAVILY" | "NONE_SUPPLEMENTAL_SKIPPED";

export type ReasoningLayerSource = "OPENAI" | null;

export interface StrictProviderStack {
  quotesSource: QuotesSource;
  candlesSource: QuotesSource;
  fundamentalsSource: "FINNHUB" | null;
  optionsSource: OptionsSource;
  earningsSource: EarningsSource;
  newsSource: NewsSource;
  webResearchSource: WebResearchSource;
  /** Interpretation only — not a market-data vendor */
  reasoningLayer: ReasoningLayerSource;
  warnings: string[];
}

export interface ResolvedStrictProviders {
  market: MarketDataAdapter | null;
  options: OptionsDataAdapter | null;
  earnings: EarningsDataAdapter | null;
  news: NewsAdapter | null;
  research: ResearchAdapter;
  stack: StrictProviderStack;
}

export function resolveStrictProviders(): ResolvedStrictProviders {
  if (env.DATA_PROVIDER !== "STRICT") {
    console.warn(
      "[STRICT] DATA_PROVIDER must be STRICT; got:",
      env.DATA_PROVIDER,
    );
  }
  const warnings: string[] = [];
  let quotesSource: QuotesSource = null;
  let market: MarketDataAdapter | null = null;

  if (env.POLYGON_API_KEY && env.FINNHUB_API_KEY) {
    market = new PolygonPrimaryFinnhubFallbackMarketAdapter(
      new PolygonMarketDataAdapter(env.POLYGON_API_KEY),
      new FinnhubMarketDataAdapter(env.FINNHUB_API_KEY),
    );
    quotesSource = "POLYGON_WITH_FINNHUB_FALLBACK";
  } else if (env.POLYGON_API_KEY) {
    market = new PolygonMarketDataAdapter(env.POLYGON_API_KEY);
    quotesSource = "POLYGON";
  } else if (env.FINNHUB_API_KEY) {
    market = new FinnhubMarketDataAdapter(env.FINNHUB_API_KEY);
    quotesSource = "FINNHUB";
  } else {
    warnings.push(
      "No POLYGON_API_KEY or FINNHUB_API_KEY — quotes, candles, and stock strategies are unavailable.",
    );
  }

  let options: OptionsDataAdapter | null = null;
  let optionsSource: OptionsSource = null;
  if (env.POLYGON_API_KEY) {
    options = new PolygonOptionsDataAdapter(env.POLYGON_API_KEY);
    optionsSource = "POLYGON";
  } else {
    warnings.push(
      "No POLYGON_API_KEY — real options chains unavailable; options scanning and options trades are disabled.",
    );
  }

  let earnings: EarningsDataAdapter | null = null;
  let earningsSource: EarningsSource = null;
  if (env.FINNHUB_API_KEY) {
    earnings = new FinnhubEarningsDataAdapter(env.FINNHUB_API_KEY);
    earningsSource = "FINNHUB";
  } else {
    warnings.push(
      "No FINNHUB_API_KEY — real earnings calendar unavailable; earnings-hunter setups are disabled.",
    );
  }

  let news: NewsAdapter | null = null;
  let newsSource: NewsSource = null;
  if (env.FINNHUB_API_KEY) {
    news = new FinnhubLiveNewsAdapter(env.FINNHUB_API_KEY);
    newsSource = "FINNHUB";
  } else {
    warnings.push(
      "No FINNHUB_API_KEY — Finnhub news unavailable; news sentiment will be skipped (not invented).",
    );
  }

  let research: ResearchAdapter;
  let webResearchSource: WebResearchSource = "NONE_SUPPLEMENTAL_SKIPPED";
  if (env.TAVILY_API_KEY) {
    research = new TavilyResearchAdapter(env.TAVILY_API_KEY);
    webResearchSource = "TAVILY";
  } else {
    research = new SkippedWebResearchAdapter();
  }

  const fundamentalsSource: "FINNHUB" | null = env.FINNHUB_API_KEY ? "FINNHUB" : null;
  if (!fundamentalsSource) {
    warnings.push("Fundamentals require FINNHUB_API_KEY.");
  }

  const reasoningLayer: ReasoningLayerSource = env.OPENAI_API_KEY ? "OPENAI" : null;
  if (!reasoningLayer) {
    warnings.push(
      "No OPENAI_API_KEY — structured AI reasoning is unavailable; symbols pass data gates but receive NO_TRADE.",
    );
  }

  return {
    market,
    options,
    earnings,
    news,
    research,
    stack: {
      quotesSource,
      candlesSource: quotesSource,
      fundamentalsSource,
      optionsSource,
      earningsSource,
      newsSource,
      webResearchSource,
      reasoningLayer,
      warnings,
    },
  };
}
