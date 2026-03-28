/** Shared DTOs for market data adapters. Facts vs inference is enforced at log/journal layer. */

export type MarketSession = "PRE" | "REGULAR" | "POST";

export interface Quote {
  symbol: string;
  exchange: string;
  last: number;
  bid?: number;
  ask?: number;
  volume?: number;
  ts: string; // ISO
  /** POLYGON | FINNHUB | etc. */
  source: string;
}

export interface Candle {
  symbol: string;
  interval: string;
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  source: string;
}

export interface OptionStrike {
  strike: number;
  expiry: string;
  right: "C" | "P";
  bid: number;
  ask: number;
  last?: number;
  openInterest?: number;
  volume?: number;
  impliedVol?: number;
  source: string;
}

export interface OptionChain {
  underlying: string;
  asOf: string;
  strikes: OptionStrike[];
  source: string;
}

export interface EarningsRow {
  symbol: string;
  exchange: string;
  datetimeUtc?: string;
  fiscalQuarter?: string;
  epsEstimate?: number;
  revenueEstimate?: number;
  source: string;
}

export interface FundamentalSnapshot {
  symbol: string;
  pe?: number;
  marketCap?: number;
  debtToEquity?: number;
  source: string;
}

export interface NewsArticle {
  id: string;
  symbol?: string;
  headline: string;
  url?: string;
  source: string;
  sentiment?: number;
  publishedAt?: string;
  /** Finnhub `related` tickers when available */
  relatedTickers?: string;
}

export interface MacroEvent {
  id: string;
  name: string;
  country?: string;
  datetimeUtc?: string;
  importance?: "LOW" | "MEDIUM" | "HIGH";
  source: string;
}
