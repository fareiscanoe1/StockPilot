import type { EarningsRow } from "./types";

export interface EarningsDataAdapter {
  getUpcoming(days: number, symbols?: string[]): Promise<EarningsRow[]>;
}

/** Real Finnhub earnings calendar only. */
export class FinnhubEarningsDataAdapter implements EarningsDataAdapter {
  constructor(private apiKey: string) {}

  async getUpcoming(days: number, symbols?: string[]): Promise<EarningsRow[]> {
    const from = new Date();
    const to = new Date(from.getTime() + days * 86400000);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);
    const syms =
      symbols?.length ? symbols : ["AAPL", "MSFT", "NVDA", "META", "AMD"];
    const merged: EarningsRow[] = [];
    const seen = new Set<string>();
    for (const sym of syms) {
      const url = `https://finnhub.io/api/v1/calendar/earnings?symbol=${encodeURIComponent(sym)}&from=${fromStr}&to=${toStr}&token=${this.apiKey}`;
      const r = await fetch(url);
      if (!r.ok) continue;
      const j = (await r.json()) as {
        earningsCalendar?: {
          date?: string;
          hour?: string;
          epsEstimate?: number;
          revenueEstimate?: number;
          symbol?: string;
        }[];
      };
      for (const e of j.earningsCalendar ?? []) {
        const key = `${e.symbol ?? sym}-${e.date ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push({
          symbol: e.symbol ?? sym,
          exchange: (e.symbol ?? sym).includes(".TO") ? "CA" : "US",
          datetimeUtc: e.date ? `${e.date}T21:00:00.000Z` : undefined,
          epsEstimate: e.epsEstimate,
          revenueEstimate: e.revenueEstimate,
          source: "FINNHUB",
        });
      }
    }
    return merged;
  }
}
