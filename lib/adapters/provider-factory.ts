/**
 * STRICT_REAL_DATA_ONLY — resolves real adapters from env keys; never returns mocks.
 */
import type { MarketDataAdapter } from "./market-data-adapter";
import type { OptionsDataAdapter } from "./options-data-adapter";
import type { EarningsDataAdapter } from "./earnings-data-adapter";
import type { NewsAdapter } from "./news-adapter";
import type { ResearchAdapter } from "./research-adapter";
import {
  resolveStrictProviders,
  type ResolvedStrictProviders,
  type StrictProviderStack,
} from "./strict-providers";

export type { ResolvedStrictProviders, StrictProviderStack };

/** UI + API summary of the active strict stack (no mock labels). */
export interface DataStackSummary {
  mode: "STRICT";
  quotes: string;
  candles: string;
  fundamentals: string;
  options: string;
  earnings: string;
  news: string;
  webResearch: string;
  /** Structured JSON trade decisions from OpenAI — not market data */
  reasoning: string;
  warnings: string[];
}

function label(v: string | null | undefined): string {
  if (v === "POLYGON_WITH_FINNHUB_FALLBACK") return "POLYGON (fallback: FINNHUB)";
  return v ?? "unavailable";
}

export function getDataStackSummary(stack?: StrictProviderStack): DataStackSummary {
  const s = stack ?? resolveStrictProviders().stack;
  return {
    mode: "STRICT",
    quotes: label(s.quotesSource),
    candles: label(s.candlesSource),
    fundamentals: label(s.fundamentalsSource),
    options: label(s.optionsSource),
    earnings: label(s.earningsSource),
    news: label(s.newsSource),
    webResearch: s.webResearchSource,
    reasoning: s.reasoningLayer ?? "unavailable",
    warnings: s.warnings,
  };
}

export function getResolvedStrictProviders(): ResolvedStrictProviders {
  return resolveStrictProviders();
}

export function getMarketDataAdapter(): MarketDataAdapter | null {
  return resolveStrictProviders().market;
}

export function getOptionsDataAdapter(): OptionsDataAdapter | null {
  return resolveStrictProviders().options;
}

export function getEarningsDataAdapter(): EarningsDataAdapter | null {
  return resolveStrictProviders().earnings;
}

export function getNewsAdapter(): NewsAdapter | null {
  return resolveStrictProviders().news;
}

export function getResearchAdapter(): ResearchAdapter {
  return resolveStrictProviders().research;
}
