/**
 * OpenAI is used only to interpret normalized vendor data — never as a market-data source.
 */
import OpenAI from "openai";
import { z } from "zod";
import type { StrategyMode, SubPortfolioType } from "@prisma/client";
import type {
  Candle,
  FundamentalSnapshot,
  NewsArticle,
  OptionChain,
  Quote,
} from "@/lib/adapters/types";
import type { SymbolResearchContext } from "@/lib/adapters/research-adapter";
import type { RiskParams } from "./risk-params";

const openAiReasoningOutputSchema = z
  .object({
    decision: z.enum(["TRADE", "NO_TRADE"]),
    confidence: z.number(),
    risk_score: z.number(),
    thesis: z.string(),
    invalidation: z.string(),
    rationale: z.string(),
    no_trade_reason: z.string(),
    /** Expected horizon in plain language, e.g. "5–15 trading days". */
    holding_period_note: z.string(),
    /** One-line catalyst / driver summary from snapshot only. */
    catalyst_summary: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.decision === "NO_TRADE") {
      const t = (data.no_trade_reason ?? "").trim();
      if (t.length < 4) {
        ctx.addIssue({
          code: "custom",
          message: "no_trade_reason must be explicit (min 4 chars) when decision is NO_TRADE",
          path: ["no_trade_reason"],
        });
      }
    }
  });

export type OpenAIReasoningOutput = z.infer<typeof openAiReasoningOutputSchema>;

/** Strict JSON schema for Chat Completions `response_format` (OpenAI structured outputs). */
export const TRADE_DECISION_JSON_SCHEMA = {
  name: "trade_decision",
  strict: true,
  schema: {
    type: "object",
    properties: {
      decision: {
        type: "string",
        enum: ["TRADE", "NO_TRADE"],
        description: "Trade only if provider data supports it; never invent figures.",
      },
      confidence: { type: "number", description: "0–10 conviction from provided data only." },
      risk_score: { type: "number", description: "0–10 risk; higher = riskier." },
      thesis: { type: "string", description: "Short trade thesis grounded in snapshot." },
      invalidation: { type: "string", description: "What would prove the idea wrong." },
      rationale: {
        type: "string",
        description: "Step-by-step reasoning referencing only fields in provider_snapshot.",
      },
      no_trade_reason: {
        type: "string",
        description:
          "If NO_TRADE, explicit rationale (min ~1 sentence). Use empty string only when decision is TRADE.",
      },
      holding_period_note: {
        type: "string",
        description:
          "Intended holding horizon in plain language from snapshot (e.g. 2–6 weeks). Required for both TRADE and NO_TRADE.",
      },
      catalyst_summary: {
        type: "string",
        description:
          "Single concise line: main catalyst or risk driver from vendor data only (earnings, news, technicals, etc.).",
      },
    },
    required: [
      "decision",
      "confidence",
      "risk_score",
      "thesis",
      "invalidation",
      "rationale",
      "no_trade_reason",
      "holding_period_note",
      "catalyst_summary",
    ],
    additionalProperties: false,
  },
} as const;

export interface ProviderSnapshotJson {
  meta: {
    symbol: string;
    strategy_mode: StrategyMode;
    sub_portfolio: SubPortfolioType;
    portfolio_value_usd: number;
    snapshot_as_of_utc: string;
  };
  data_provenance: Record<string, string | null>;
  quote: {
    last: number;
    bid: number;
    ask: number;
    spread_pct: number;
    volume: number;
    ts: string;
    source: string;
    /** True when bid/ask are from a live NBBO path; false when synthesized from last for context only. */
    nbbo_observed: boolean;
  };
  candles_daily: {
    interval: string;
    bar_count: number;
    source: string;
    /** Most recent bars first (newest → older), capped for token limits */
    recent_bars_desc: { t: string; o: number; h: number; l: number; c: number; v: number }[];
  };
  fundamentals: {
    pe?: number;
    market_cap?: number;
    debt_to_equity?: number;
    source: string | null;
  } | null;
  earnings: {
    symbol_has_upcoming_in_scan_window: boolean;
    calendar_vendor: string | null;
  };
  news: {
    adapter_available: boolean;
    headline_count: number;
    aggregated_sentiment_vendor?: number | null;
    items: { headline: string; source: string; url?: string }[];
  };
  options: {
    strategy_requires_liquid_option: boolean;
    selected_contract: null | {
      strike: number;
      expiry: string;
      right: string;
      bid: number;
      ask: number;
      open_interest?: number;
      volume?: number;
      implied_vol?: number;
      source: string;
    };
  };
  /** Tavily / skipped — labeled non-market-data context */
  open_web_research: {
    source: string;
    query: string;
    result_titles: string[];
    result_urls: string[];
  };
  risk_profile: {
    max_position_pct: number;
    max_bid_ask_spread_pct: number;
    allow_high_event_risk: boolean;
  };
  derived_features: {
    technical_trend_score_0_1: number;
    liquidity_check_passed: boolean;
  };
}

const SYSTEM_PROMPT = `You are a disciplined trading desk analyst for a STRICT_REAL_DATA_ONLY system.

Rules:
- You receive a single JSON object: { "provider_snapshot": <data> }.
- provider_snapshot contains ONLY normalized fields from external market data vendors (Polygon, Finnhub, etc.) and optional open-web research clearly labeled as non-market-data.
- You MUST NOT invent prices, volumes, dates, earnings times, option quotes, or news. If the snapshot is insufficient for a responsible idea, respond with decision "NO_TRADE".
- Your output MUST match the JSON schema exactly. Ground thesis, rationale, invalidation, confidence, and risk_score strictly in the numbers and text provided.
- open_web_research is supplemental context only — never treat it as exchange-verified market data.
- confidence and risk_score are on a scale of 0–10 (decimals allowed).
- Output MUST be JSON only matching the schema. No prose outside JSON.
- For NO_TRADE, no_trade_reason MUST be a clear, user-readable explanation (never empty or generic).
- holding_period_note and catalyst_summary are REQUIRED for every response — use "N/A" only if truly impossible from snapshot.`;

export function buildProviderSnapshot(input: {
  symbol: string;
  mode: StrategyMode;
  subPortfolio: SubPortfolioType;
  portfolioValue: number;
  provenance: Record<string, string | null>;
  quote: Quote;
  underlyingNbboObserved: boolean;
  spreadPct: number;
  candles: Candle[];
  fundamentals: FundamentalSnapshot | null;
  earningsInWindow: boolean;
  earningsCalendarVendor: string | null;
  articles: NewsArticle[];
  newsSkipped: boolean;
  newsAdapterPresent: boolean;
  web: SymbolResearchContext;
  bestOpt: OptionChain["strikes"][0] | null;
  optionsMode: boolean;
  risk: RiskParams;
  technicalTrend: number;
  liquidityCheckPassed: boolean;
}): ProviderSnapshotJson {
  const bars = [...input.candles]
    .sort((a, b) => new Date(b.t).getTime() - new Date(a.t).getTime())
    .slice(0, 24)
    .map((c) => ({
      t: c.t,
      o: c.o,
      h: c.h,
      l: c.l,
      c: c.c,
      v: c.v,
    }));

  const sent =
    !input.newsSkipped && input.articles.length
      ? input.articles.reduce((a, n) => a + (n.sentiment ?? 0), 0) /
        input.articles.length
      : null;

  return {
    meta: {
      symbol: input.symbol,
      strategy_mode: input.mode,
      sub_portfolio: input.subPortfolio,
      portfolio_value_usd: input.portfolioValue,
      snapshot_as_of_utc: new Date().toISOString(),
    },
    data_provenance: input.provenance,
    quote: {
      last: input.quote.last,
      bid: input.quote.bid!,
      ask: input.quote.ask!,
      spread_pct: input.spreadPct,
      volume: input.quote.volume!,
      ts: input.quote.ts,
      source: input.quote.source,
      nbbo_observed: input.underlyingNbboObserved,
    },
    candles_daily: {
      interval: input.candles[0]?.interval ?? "1d",
      bar_count: input.candles.length,
      source: input.candles[0]?.source ?? input.quote.source,
      recent_bars_desc: bars,
    },
    fundamentals: input.fundamentals
      ? {
          pe: input.fundamentals.pe,
          market_cap: input.fundamentals.marketCap,
          debt_to_equity: input.fundamentals.debtToEquity,
          source: input.fundamentals.source,
        }
      : null,
    earnings: {
      symbol_has_upcoming_in_scan_window: input.earningsInWindow,
      calendar_vendor: input.earningsCalendarVendor,
    },
    news: {
      adapter_available: input.newsAdapterPresent,
      headline_count: input.articles.length,
      aggregated_sentiment_vendor: sent,
      items: input.articles.slice(0, 8).map((a) => ({
        headline: a.headline,
        source: a.source,
        url: a.url,
      })),
    },
    options: {
      strategy_requires_liquid_option: input.optionsMode,
      selected_contract: input.bestOpt
        ? {
            strike: input.bestOpt.strike,
            expiry: input.bestOpt.expiry,
            right: input.bestOpt.right,
            bid: input.bestOpt.bid,
            ask: input.bestOpt.ask,
            open_interest: input.bestOpt.openInterest,
            volume: input.bestOpt.volume,
            implied_vol: input.bestOpt.impliedVol,
            source: input.bestOpt.source,
          }
        : null,
    },
    open_web_research: {
      source: input.web.source,
      query: input.web.query,
      result_titles: input.web.snippets.map((s) => s.title).slice(0, 6),
      result_urls: input.web.snippets.map((s) => s.url).filter(Boolean).slice(0, 6),
    },
    risk_profile: {
      max_position_pct: input.risk.maxPositionPct,
      max_bid_ask_spread_pct: input.risk.maxBidAskSpreadPct,
      allow_high_event_risk: input.risk.allowHighEventRisk,
    },
    derived_features: {
      technical_trend_score_0_1: input.technicalTrend,
      liquidity_check_passed: input.liquidityCheckPassed,
    },
  };
}

function clamp01(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export async function runOpenAIReasoning(
  apiKey: string,
  model: string,
  snapshot: ProviderSnapshotJson,
): Promise<
  | { ok: true; output: OpenAIReasoningOutput; rawContent: string }
  | { ok: false; error: string }
> {
  const client = new OpenAI({ apiKey });
  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({ provider_snapshot: snapshot }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: TRADE_DECISION_JSON_SCHEMA,
      },
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return { ok: false, error: "empty_completion" };
    }
    const parsed = JSON.parse(content) as unknown;
    const out = openAiReasoningOutputSchema.safeParse(parsed);
    if (!out.success) {
      return { ok: false, error: `schema:${out.error.message}` };
    }
    const o = out.data;
    return {
      ok: true,
      output: {
        ...o,
        confidence: clamp01(o.confidence, 0, 10),
        risk_score: clamp01(o.risk_score, 0, 10),
        holding_period_note: o.holding_period_note?.trim() || "See rationale",
        catalyst_summary: o.catalyst_summary?.trim() || "See snapshot",
      },
      rawContent: content,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
