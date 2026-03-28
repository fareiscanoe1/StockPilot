import type { MacroEvent, NewsArticle } from "./types";

export interface NewsAdapter {
  getNews(symbol?: string, limit?: number): Promise<NewsArticle[]>;
  getMacroCalendar?(from: Date, to: Date): Promise<MacroEvent[]>;
}

function mapFinnhubArticle(
  n: {
    id: number;
    headline: string;
    url: string;
    source: string;
    datetime: number;
    related?: string;
  },
  symbol?: string,
): NewsArticle {
  return {
    id: String(n.id),
    symbol,
    headline: n.headline,
    url: n.url,
    source: n.source,
    publishedAt: new Date(n.datetime * 1000).toISOString(),
    relatedTickers: n.related,
  };
}

/**
 * Live Finnhub: general market wire + company-specific flow when a symbol is provided.
 */
export class FinnhubLiveNewsAdapter implements NewsAdapter {
  constructor(private apiKey: string) {}

  private async fetchGeneral(limit: number): Promise<NewsArticle[]> {
    const url = `https://finnhub.io/api/v1/news?category=general&token=${this.apiKey}`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const arr = (await r.json()) as {
      id: number;
      headline: string;
      url: string;
      source: string;
      datetime: number;
      related?: string;
    }[];
    return arr.slice(0, limit).map((n) => mapFinnhubArticle(n));
  }

  private async fetchCompany(symbol: string, limit: number): Promise<NewsArticle[]> {
    const from = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${this.apiKey}`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const arr = (await r.json()) as {
      id: number;
      headline: string;
      url: string;
      source: string;
      datetime: number;
    }[];
    return arr.slice(0, limit).map((n) => mapFinnhubArticle(n, symbol));
  }

  async getNews(symbol?: string, limit = 12): Promise<NewsArticle[]> {
    const half = Math.ceil(limit / 2);
    const general = await this.fetchGeneral(half + 4);
    if (!symbol) {
      return general.slice(0, limit);
    }
    const company = await this.fetchCompany(symbol, half + 4);
    const symU = symbol.toUpperCase();
    const base = symU.split(".")[0] ?? symU;
    const relatedGeneral = general.filter(
      (g) =>
        g.headline.toUpperCase().includes(base) ||
        (g.relatedTickers?.toUpperCase().includes(symU) ?? false),
    );
    const merged = [...company, ...relatedGeneral, ...general];
    const seen = new Set<string>();
    const out: NewsArticle[] = [];
    for (const a of merged) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push({ ...a, symbol: a.symbol ?? symbol });
      if (out.length >= limit) break;
    }
    return out;
  }

  async getMacroCalendar(from: Date, to: Date): Promise<MacroEvent[]> {
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);
    const url = `https://finnhub.io/api/v1/calendar/economic?from=${fromStr}&to=${toStr}&token=${this.apiKey}`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const j = (await r.json()) as {
      economicCalendar?: {
        event?: string;
        country?: string;
        time?: string;
        impact?: string;
      }[];
    };
    return (j.economicCalendar ?? []).map((e, i) => ({
      id: `fh-eco-${fromStr}-${i}`,
      name: e.event ?? "Economic event",
      country: e.country,
      datetimeUtc: e.time,
      importance:
        e.impact === "high" ? "HIGH" : e.impact === "medium" ? "MEDIUM" : "LOW",
      source: "FINNHUB",
    }));
  }
}

/** @deprecated use FinnhubLiveNewsAdapter */
export const FinnhubNewsAdapter = FinnhubLiveNewsAdapter;
