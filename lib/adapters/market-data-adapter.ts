import type { Candle, FundamentalSnapshot, Quote } from "./types";

const RAW_QUOTE_LOG = new Set(
  (process.env.MARKET_QUOTE_RAW_LOG_SYMBOLS ?? "AAPL,MSFT,NVDA")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
);

/** Polygon SIP timestamps are often nanoseconds; ms Unix times are ~1e12–1e13. */
function polygonTimeToIso(t: number | undefined): string {
  if (t == null || !Number.isFinite(t)) return new Date().toISOString();
  const ms = t > 1e15 ? Math.floor(t / 1e6) : t;
  return new Date(ms).toISOString();
}

function logRawQuote(vendor: string, symbol: string, label: string, payload: unknown) {
  if (!RAW_QUOTE_LOG.has(symbol.toUpperCase())) return;
  try {
    const j = JSON.stringify(payload);
    const cap = 4500;
    console.warn(
      `[QuoteRaw] ${vendor} ${symbol} ${label} (${j.length}b): ${j.slice(0, cap)}${j.length > cap ? "…" : ""}`,
    );
  } catch {
    console.warn(`[QuoteRaw] ${vendor} ${symbol} ${label}: <serialize error>`);
  }
}

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
    if (!r.ok) {
      console.warn(`[Polygon] snapshot ${sym} failed: HTTP ${r.status}`);
      return null;
    }
    const j = (await r.json()) as {
      ticker?: {
        lastTrade?: { p?: number; t?: number };
        lastQuote?: { p?: number; P?: number };
        last_quote?: { p?: number; P?: number };
        day?: { c?: number; v?: number; h?: number; l?: number; o?: number };
        prevDay?: { c?: number; v?: number };
      };
    };
    logRawQuote("POLYGON", sym, "v2/snapshot/stocks/tickers", j);
    const t = j.ticker;
    if (!t) {
      console.warn(`[Polygon] ${sym}: snapshot JSON missing ticker object`);
      return null;
    }

    // lastTrade is often absent after hours / delayed feeds; day.c and prevDay.c are still Polygon data
    const last =
      t.lastTrade?.p ??
      (t.day?.c != null && t.day.c > 0 ? t.day.c : undefined) ??
      (t.prevDay?.c != null && t.prevDay.c > 0 ? t.prevDay.c : undefined);
    if (last == null || last <= 0) {
      console.warn(`[Polygon] ${sym}: no last price in snapshot (no trade/day/prevDay close)`);
      return null;
    }

    let volume = t.day?.v;
    if ((volume == null || volume <= 0) && t.prevDay?.v != null && t.prevDay.v > 0) {
      volume = t.prevDay.v;
    }
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

    const lq = t.lastQuote ?? t.last_quote;
    let bid = lq?.p;
    let ask = lq?.P;
    let bidAskSource: Quote["bidAskSource"] | undefined =
      bid != null && ask != null && bid > 0 && ask >= bid ? "POLYGON_SNAPSHOT" : undefined;

    if (bid == null || ask == null || bid <= 0 || ask < bid) {
      /** Correct NBBO path (Polygon docs); legacy `/v2/last/quote/stocks/…` 404s on current API. */
      const nbboUrl = `https://api.polygon.io/v2/last/nbbo/${encodeURIComponent(sym)}?apiKey=${this.apiKey}`;
      const qr = await fetch(nbboUrl);
      const qj = (await qr.json().catch(() => ({}))) as {
        results?: { p?: number; P?: number };
        status?: string;
      };
      logRawQuote("POLYGON", sym, "v2/last/nbbo", qj);
      if (qr.ok) {
        const rq = qj.results;
        if (rq?.p != null && rq.P != null && rq.p > 0 && rq.P >= rq.p) {
          bid = rq.p;
          ask = rq.P;
          bidAskSource = "POLYGON_NBBO";
        }
      } else {
        console.warn(`[Polygon] ${sym}: NBBO endpoint HTTP ${qr.status}`);
      }
    }

    const hasNbbo = bid != null && ask != null && bid > 0 && ask >= bid;
    const out: Quote = {
      symbol: sym,
      exchange: "US",
      last,
      volume,
      ts: polygonTimeToIso(t.lastTrade?.t),
      source: "POLYGON",
    };
    if (hasNbbo) {
      out.bid = bid;
      out.ask = ask;
      out.bidAskSource = bidAskSource;
    }
    return out;
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

/**
 * Both keys set: prefer Polygon (aligns with options chain source), but if snapshot/quote
 * is empty (tier, after-hours gaps, etc.) fall back to Finnhub — still real vendor data.
 */
export class PolygonPrimaryFinnhubFallbackMarketAdapter implements MarketDataAdapter {
  constructor(
    private polygon: PolygonMarketDataAdapter,
    private finnhub: FinnhubMarketDataAdapter,
  ) {}

  async getQuote(symbol: string, exchange?: string): Promise<Quote | null> {
    const q = await this.polygon.getQuote(symbol, exchange);
    if (!q) {
      const f = await this.finnhub.getQuote(symbol, exchange);
      if (f) {
        console.warn(
          `[STRICT] ${symbol}: Polygon returned no quote — using Finnhub (check Polygon tier / market hours).`,
        );
      }
      return f;
    }
    const needNbbo =
      q.bid == null ||
      q.ask == null ||
      q.bid <= 0 ||
      q.ask < q.bid;
    if (!needNbbo) return q;

    const f = await this.finnhub.getQuote(symbol, exchange);
    if (
      f?.bid != null &&
      f?.ask != null &&
      f.bid > 0 &&
      f.ask >= f.bid
    ) {
      console.warn(
        `[STRICT] ${symbol}: Polygon quote without NBBO — merged Finnhub bid/ask.`,
      );
      return {
        ...q,
        bid: f.bid,
        ask: f.ask,
        bidAskSource: "FINNHUB_BIDASK",
      };
    }
    return q;
  }

  async getCandles(
    symbol: string,
    interval: string,
    from: Date,
    to: Date,
    exchange?: string,
  ): Promise<Candle[]> {
    const c = await this.polygon.getCandles(symbol, interval, from, to);
    if (c.length >= 5) return c;
    return this.finnhub.getCandles(symbol, interval, from, to);
  }

  async getFundamentals(symbol: string): Promise<FundamentalSnapshot | null> {
    return this.finnhub.getFundamentals(symbol);
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
    logRawQuote("FINNHUB", symbol, "v1/quote", j);
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
    if (volume == null || volume <= 0) {
      const mu = `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${this.apiKey}`;
      const mr = await fetch(mu);
      if (mr.ok) {
        const mj = (await mr.json()) as {
          metric?: {
            "10DayAverageTradingVolume"?: number;
            "3MonthAverageTradingVolume"?: number;
          };
        };
        const v10 = mj.metric?.["10DayAverageTradingVolume"];
        const v3m = mj.metric?.["3MonthAverageTradingVolume"];
        const raw = (v10 && v10 > 0 ? v10 : v3m) ?? 0;
        if (raw > 0) {
          // Finnhub averages are commonly in millions of shares.
          volume = raw < 1_000 ? raw * 1_000_000 : raw;
        }
      }
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
      logRawQuote("FINNHUB", symbol, "v1/stock/bidask", bj);
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

    const qOut: Quote = {
      symbol,
      exchange: symbol.includes(".") ? "CA" : "US",
      last: j.c,
      volume,
      ts: j.t ? new Date(j.t * 1000).toISOString() : new Date().toISOString(),
      source: "FINNHUB",
    };
    if (bid != null && ask != null) {
      qOut.bid = bid;
      qOut.ask = ask;
      qOut.bidAskSource = "FINNHUB_BIDASK";
    }
    return qOut;
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
