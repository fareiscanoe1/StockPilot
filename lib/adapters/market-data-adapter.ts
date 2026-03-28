import type { Candle, FundamentalSnapshot, Quote } from "./types";

/** Stock and index price data — abstracts Polygon, Finnhub, etc. */
export interface MarketDataAdapter {
  getQuote(symbol: string, exchange?: string): Promise<Quote | null>;
  getCandles(
    symbol: string,
    interval: string,
    from: Date,
    to: Date,
    exchange?: string,
  ): Promise<Candle[]>;
  getFundamentals(symbol: string): Promise<FundamentalSnapshot | null>;
}

/** Real Polygon.io REST (stocks v2 aggregates + snapshot) — requires key. */
export class PolygonMarketDataAdapter implements MarketDataAdapter {
  constructor(private apiKey: string) {}

  async getQuote(symbol: string, exchange = "US"): Promise<Quote | null> {
    const sym = exchange === "US" ? symbol : symbol;
    const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${sym}?apiKey=${this.apiKey}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = (await r.json()) as {
      ticker?: {
        lastTrade?: { p?: number; t?: number };
        lastQuote?: { p?: number; P?: number };
        day?: { v?: number };
      };
    };
    const t = j.ticker;
    if (!t?.lastTrade?.p) return null;
    let volume = t.day?.v;
    if (volume == null || volume <= 0) {
      const toS = Math.floor(Date.now() / 1000);
      const fromS = toS - 10 * 86400;
      const u2 = `https://api.polygon.io/v2/aggs/ticker/${sym}/range/1/day/${fromS}/${toS}?adjusted=true&sort=desc&limit=1&apiKey=${this.apiKey}`;
      const r2 = await fetch(u2);
      if (r2.ok) {
        const j2 = (await r2.json()) as { results?: { v?: number }[] };
        volume = j2.results?.[0]?.v;
      }
    }
    const last = t.lastTrade.p;
    const lq = t.lastQuote;
    const bid = lq?.p;
    const ask = lq?.P;
    return {
      symbol: sym,
      exchange: "US",
      last,
      ...(bid != null && ask != null && bid > 0 && ask >= bid ? { bid, ask } : {}),
      volume,
      ts: t.lastTrade.t
        ? new Date(t.lastTrade.t).toISOString()
        : new Date().toISOString(),
      source: "POLYGON",
    };
  }

  async getCandles(
    symbol: string,
    interval: string,
    from: Date,
    to: Date,
  ): Promise<Candle[]> {
    const mult = interval === "1d" ? 1 : interval === "1h" ? 1 : 1;
    const timespan =
      interval === "1d" ? "day" : interval === "1h" ? "hour" : "minute";
    const fromS = Math.floor(from.getTime() / 1000);
    const toS = Math.floor(to.getTime() / 1000);
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${mult}/${timespan}/${fromS}/${toS}?adjusted=true&sort=asc&limit=50000&apiKey=${this.apiKey}`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const j = (await r.json()) as {
      results?: { t: number; o: number; h: number; l: number; c: number; v: number }[];
    };
    return (j.results ?? []).map((b) => ({
      symbol,
      interval,
      t: new Date(b.t).toISOString(),
      o: b.o,
      h: b.h,
      l: b.l,
      c: b.c,
      v: b.v,
      source: "POLYGON",
    }));
  }

  async getFundamentals(symbol: string): Promise<FundamentalSnapshot | null> {
    void symbol;
    // Polygon fundamentals live behind separate product tiers — return null and use Finnhub adapter in composite if needed.
    return null;
  }
}

/** Finnhub quote + daily candles + metric snapshot — works when Polygon is unavailable. */
export class FinnhubMarketDataAdapter implements MarketDataAdapter {
  constructor(private apiKey: string) {}

  async getQuote(symbol: string, exchange = "US"): Promise<Quote | null> {
    void exchange;
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${this.apiKey}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = (await r.json()) as { c?: number; t?: number; pc?: number };
    if (j.c == null || j.c === 0) return null;

    let volume: number | undefined;
    const toS = Math.floor(Date.now() / 1000);
    const fromS = toS - 14 * 86400;
    const cu = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${fromS}&to=${toS}&token=${this.apiKey}`;
    const cr = await fetch(cu);
    if (cr.ok) {
      const cj = (await cr.json()) as { s?: string; v?: number[] };
      if (cj.s === "ok" && cj.v?.length) volume = cj.v[cj.v.length - 1];
    }

    let bid: number | undefined;
    let ask: number | undefined;
    const bu = `https://finnhub.io/api/v1/stock/bidask?symbol=${encodeURIComponent(symbol)}&token=${this.apiKey}`;
    const br = await fetch(bu);
    if (br.ok) {
      const bj = (await br.json()) as {
        s?: string;
        bidPrice?: number[];
        askPrice?: number[];
      };
      if (
        bj.s === "ok" &&
        bj.bidPrice?.length &&
        bj.askPrice?.length &&
        bj.bidPrice[0]! > 0 &&
        bj.askPrice[0]! >= bj.bidPrice[0]!
      ) {
        bid = bj.bidPrice[0];
        ask = bj.askPrice[0];
      }
    }

    return {
      symbol,
      exchange: symbol.includes(".") ? "CA" : "US",
      last: j.c,
      ...(bid != null && ask != null ? { bid, ask } : {}),
      volume,
      ts: j.t ? new Date(j.t * 1000).toISOString() : new Date().toISOString(),
      source: "FINNHUB",
    };
  }

  async getCandles(
    symbol: string,
    interval: string,
    from: Date,
    to: Date,
  ): Promise<Candle[]> {
    const resolution =
      interval === "1d" ? "D" : interval === "1h" ? "60" : "60";
    const fromS = Math.floor(from.getTime() / 1000);
    const toS = Math.floor(to.getTime() / 1000);
    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${fromS}&to=${toS}&token=${this.apiKey}`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const j = (await r.json()) as {
      s?: string;
      t?: number[];
      o?: number[];
      h?: number[];
      l?: number[];
      c?: number[];
      v?: number[];
    };
    if (j.s !== "ok" || !j.t?.length) return [];
    const out: Candle[] = [];
    for (let i = 0; i < j.t.length; i++) {
      out.push({
        symbol,
        interval,
        t: new Date(j.t[i]! * 1000).toISOString(),
        o: j.o![i]!,
        h: j.h![i]!,
        l: j.l![i]!,
        c: j.c![i]!,
        v: j.v![i] ?? 0,
        source: "FINNHUB",
      });
    }
    return out;
  }

  async getFundamentals(symbol: string): Promise<FundamentalSnapshot | null> {
    const url = `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${this.apiKey}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = (await r.json()) as {
      metric?: {
        peNormalizedAnnual?: number;
        marketCapitalization?: number;
        debtEquityAnnual?: number;
      };
    };
    const m = j.metric;
    if (!m) return { symbol, source: "FINNHUB" };
    return {
      symbol,
      pe: m.peNormalizedAnnual,
      marketCap: m.marketCapitalization,
      debtToEquity: m.debtEquityAnnual,
      source: "FINNHUB",
    };
  }
}
