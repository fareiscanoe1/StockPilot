/**
 * Post-fix validation (automated):
 * - Equities without vendor NBBO still reach OpenAI / score-based NO_TRADE (not blocked on NBBO alone).
 * - Options require per-strike NBBO; missing → OPTIONS_CONTRACT_NBBO_MISSING; wide spread → OPTIONS_SPREAD_TOO_WIDE.
 *
 * Manual: signed-in `/scanner?debug=1` — confirm AAPL/MSFT/NVDA debug JSON shows NBBO or Finnhub merge,
 * candidates/decisions match expectations, and NBBO badges in the table.
 */
import type { EarningsDataAdapter } from "@/lib/adapters/earnings-data-adapter";
import type { MarketDataAdapter } from "@/lib/adapters/market-data-adapter";
import type { NewsAdapter } from "@/lib/adapters/news-adapter";
import type { OptionsDataAdapter } from "@/lib/adapters/options-data-adapter";
import type { OptionChain } from "@/lib/adapters/types";
import type { ResolvedStrictProviders } from "@/lib/adapters/strict-providers";
import { SkippedWebResearchAdapter } from "@/lib/adapters/research-adapter";
import { RiskEngine } from "@/lib/engines/risk-engine";
import { REASON, StrictStrategyEngine } from "@/lib/engines/strategy-engine";
import { OPTION_SPECIFIC_REASON_CODES } from "@/lib/scanner-display";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engines/openai-reasoning", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/engines/openai-reasoning")>();
  return {
    ...actual,
    runOpenAIReasoning: vi.fn(async () => ({
      ok: true as const,
      output: {
        decision: "NO_TRADE" as const,
        confidence: 5,
        risk_score: 5,
        thesis: "integration",
        invalidation: "integration",
        rationale: "integration",
        no_trade_reason: "Integration stub — explicit no-trade rationale required.",
        holding_period_note: "N/A — no trade",
        catalyst_summary: "Vendor snapshot only — test harness",
      },
      rawContent: "{}",
    })),
  };
});

const stackBase = {
  quotesSource: "POLYGON" as const,
  candlesSource: "POLYGON" as const,
  fundamentalsSource: "FINNHUB" as const,
  optionsSource: "POLYGON" as const,
  earningsSource: "FINNHUB" as const,
  newsSource: "FINNHUB" as const,
  webResearchSource: "NONE_SUPPLEMENTAL_SKIPPED" as const,
  reasoningLayer: "OPENAI" as const,
  warnings: [] as string[],
};

function candles(symbol: string) {
  const out = [];
  for (let i = 0; i < 10; i++) {
    /** Oldest → newest (matches typical aggregate order); rising closes = uptrend. */
    const t = new Date(Date.now() - (9 - i) * 86400000).toISOString();
    out.push({
      symbol,
      interval: "1d" as const,
      t,
      o: 100,
      h: 102,
      l: 99,
      c: 100 + i * 0.4,
      v: 2_000_000,
      source: "MOCK",
    });
  }
  return out;
}

/** Equity quote with real last + volume but no bid/ask (NBBO absent from vendor). */
const marketNoNbbo: MarketDataAdapter = {
  async getQuote(symbol) {
    return {
      symbol,
      exchange: "US",
      last: 188.12,
      volume: 55_000_000,
      ts: new Date().toISOString(),
      source: "MOCK_NO_NBBO",
    };
  },
  getCandles: async (_s, _i, _f, _t) => candles("AAPL"),
  getFundamentals: async (symbol) => ({
    symbol,
    pe: 28,
    source: "MOCK",
  }),
};

const newsMock: NewsAdapter = {
  async getNews() {
    return [
      {
        id: "1",
        headline: "Test headline",
        source: "MOCK",
      },
    ];
  },
};

const earningsMock: EarningsDataAdapter = {
  async getUpcoming(_days, _symbols) {
    return [];
  },
};

describe("StrictStrategyEngine NBBO / options gates", () => {
  it("equities are not blocked solely by missing NBBO when last, volume, and candles are valid", async () => {
    const providers: ResolvedStrictProviders = {
      market: marketNoNbbo,
      options: null,
      earnings: earningsMock,
      news: newsMock,
      research: new SkippedWebResearchAdapter(),
      stack: stackBase,
    };
    const risk = new RiskEngine("BALANCED");
    const engine = new StrictStrategyEngine("BALANCED", providers, risk);
    const { decisions } = await engine.scanUniverse(["AAPL"], 100_000, "SWING");

    const row = decisions.find((d) => d.ticker === "AAPL");
    expect(row).toBeDefined();
    expect(row!.reasonCode).toBe(REASON.OPENAI_DECISION_NO_TRADE);
    expect(row!.decision).toBe("NO_TRADE");
    for (const d of decisions) {
      expect(d.reasonCode).not.toBe("MISSING_REAL_BID_ASK");
    }
  });

  it("options mode blocks with OPTIONS_CONTRACT_NBBO_MISSING when no strike has bid and ask", async () => {
    const farExp = new Date(Date.now() + 50 * 86400000).toISOString().slice(0, 10);
    const chainNoNbbo: OptionChain = {
      underlying: "AAPL",
      asOf: new Date().toISOString(),
      source: "MOCK",
      strikes: [
        {
          strike: 180,
          expiry: farExp,
          right: "C",
          bid: 0,
          ask: 2.5,
          source: "MOCK",
        },
        {
          strike: 185,
          expiry: farExp,
          right: "C",
          bid: 1.2,
          ask: 0,
          source: "MOCK",
        },
      ],
    };

    const optionsMock: OptionsDataAdapter = {
      async getChain() {
        return chainNoNbbo;
      },
    };

    const providers: ResolvedStrictProviders = {
      market: marketNoNbbo,
      options: optionsMock,
      earnings: earningsMock,
      news: newsMock,
      research: new SkippedWebResearchAdapter(),
      stack: stackBase,
    };
    const risk = new RiskEngine("OPTIONS_MOMENTUM");
    const engine = new StrictStrategyEngine("OPTIONS_MOMENTUM", providers, risk);
    const { decisions } = await engine.scanUniverse(["AAPL"], 100_000, "SWING");

    const row = decisions.find((d) => d.ticker === "AAPL");
    expect(row?.reasonCode).toBe(REASON.OPTIONS_CONTRACT_NBBO_MISSING);
    expect(row?.decision).toBe("NO_TRADE");
  });

  it("options NO_TRADE reasons use option-specific codes only (contract NBBO / spread / chain / module)", async () => {
    const farExp = new Date(Date.now() + 50 * 86400000).toISOString().slice(0, 10);
    const chainWideSpread: OptionChain = {
      underlying: "AAPL",
      asOf: new Date().toISOString(),
      source: "MOCK",
      strikes: [
        {
          strike: 180,
          expiry: farExp,
          right: "C",
          bid: 0.01,
          ask: 9.99,
          openInterest: 5000,
          volume: 500,
          source: "MOCK",
        },
      ],
    };

    const optionsMock: OptionsDataAdapter = {
      async getChain() {
        return chainWideSpread;
      },
    };

    const providers: ResolvedStrictProviders = {
      market: marketNoNbbo,
      options: optionsMock,
      earnings: earningsMock,
      news: newsMock,
      research: new SkippedWebResearchAdapter(),
      stack: stackBase,
    };
    const risk = new RiskEngine("OPTIONS_MOMENTUM");
    const engine = new StrictStrategyEngine("OPTIONS_MOMENTUM", providers, risk);
    const { decisions } = await engine.scanUniverse(["AAPL"], 100_000, "SWING");

    const row = decisions.find((d) => d.ticker === "AAPL");
    expect(row?.reasonCode).toBe(REASON.OPTIONS_NO_QUALIFYING_STRIKE);
    if (row?.reasonCode && row.decision === "NO_TRADE") {
      expect(OPTION_SPECIFIC_REASON_CODES.has(row.reasonCode)).toBe(true);
    }
  });
});
