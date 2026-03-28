import prisma from "@/lib/db";
import type { MarketDataAdapter } from "@/lib/adapters/market-data-adapter";
import type { EarningsDataAdapter } from "@/lib/adapters/earnings-data-adapter";

export interface BacktestParams {
  symbols: string[];
  from: Date;
  to: Date;
  initialCash: number;
  strategyTag?: string;
}

export interface BacktestResult {
  finalEquity: number;
  trades: { t: string; symbol: string; side: "BUY" | "SELL"; px: number; qty: number }[];
  byStrategy: Record<string, number>;
}

/** Lightweight historical replay — uses candle closes; options-aware path requires richer data. */
export class BacktestEngine {
  constructor(
    private market: MarketDataAdapter | null,
    private earnings: EarningsDataAdapter | null,
  ) {}

  async run(
    userId: string,
    name: string,
    params: BacktestParams,
  ): Promise<{ id: string; result: BacktestResult }> {
    const run = await prisma.backtestRun.create({
      data: {
        userId,
        name,
        params: params as object,
      },
    });

    let cash = params.initialCash;
    const positions: Record<string, number> = {};
    const trades: BacktestResult["trades"] = [];

    if (!this.market || !this.earnings) {
      const blocked: BacktestResult = {
        finalEquity: params.initialCash,
        trades: [],
        byStrategy: {},
      };
      await prisma.backtestRun.update({
        where: { id: run.id },
        data: {
          result: {
            ...blocked,
            strictReason: "MISSING_MARKET_OR_EARNINGS_ADAPTER",
          } as object,
          completedAt: new Date(),
        },
      });
      return { id: run.id, result: blocked };
    }

    for (const symbol of params.symbols) {
      const candles = await this.market.getCandles(symbol, "1d", params.from, params.to);
      const earn = await this.earnings.getUpcoming(365, [symbol]);
      const earnDates = new Set(
        earn.map((e) => (e.datetimeUtc ? e.datetimeUtc.slice(0, 10) : "")),
      );

      for (let i = 2; i < candles.length; i++) {
        const c = candles[i];
        const prev = candles[i - 1];
        const breakout = c.c > prev.h * 1.01;
        const day = c.t.slice(0, 10);
        const nearEarn = earnDates.has(day);

        if (breakout && cash > 5000 && !positions[symbol]) {
          const px = c.c;
          const qty = Math.floor(5000 / px);
          if (qty <= 0) continue;
          const cost = qty * px;
          cash -= cost;
          positions[symbol] = qty;
          trades.push({ t: c.t, symbol, side: "BUY", px, qty });
        } else if (positions[symbol] && (c.c < prev.l || nearEarn)) {
          const qty = positions[symbol];
          const px = c.c;
          cash += qty * px;
          trades.push({ t: c.t, symbol, side: "SELL", px, qty });
          delete positions[symbol];
        }
      }
    }

    let equity = cash;
    for (const [sym, qty] of Object.entries(positions)) {
      const last = await this.market.getQuote(sym);
      if (last) equity += qty * last.last;
    }

    const result: BacktestResult = {
      finalEquity: equity,
      trades,
      byStrategy: { breakout_earnings_proxy: equity - params.initialCash },
    };

    await prisma.backtestRun.update({
      where: { id: run.id },
      data: {
        result: result as object,
        completedAt: new Date(),
      },
    });

    return { id: run.id, result };
  }
}
