/**
 * Supplemental open-web context only — never replaces quotes, earnings, fundamentals, or options.
 */

export interface ResearchSnippet {
  title: string;
  url: string;
  snippet: string;
}

export interface SymbolResearchContext {
  query: string;
  snippets: ResearchSnippet[];
  /** NONE_SUPPLEMENTAL_SKIPPED = no Tavily key; TAVILY = real search results */
  source: string;
}

export interface ResearchAdapter {
  gatherSymbolContext(symbol: string, companyHint?: string): Promise<SymbolResearchContext>;
}

/** No Tavily key — open-web layer skipped (not mock market data). */
export class SkippedWebResearchAdapter implements ResearchAdapter {
  async gatherSymbolContext(): Promise<SymbolResearchContext> {
    return {
      query: "",
      snippets: [],
      source: "NONE_SUPPLEMENTAL_SKIPPED",
    };
  }
}

/** Tavily search API — labeled open-web research in provenance only. */
export class TavilyResearchAdapter implements ResearchAdapter {
  constructor(private apiKey: string) {}

  async gatherSymbolContext(
    symbol: string,
    companyHint?: string,
  ): Promise<SymbolResearchContext> {
    const q = companyHint
      ? `${symbol} ${companyHint} stock earnings news analyst`
      : `${symbol} stock market news earnings latest`;
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        query: q,
        search_depth: "advanced",
        max_results: 6,
        include_answer: false,
      }),
    });
    if (!r.ok) {
      return {
        query: q,
        snippets: [],
        source: `TAVILY_HTTP_${r.status}`,
      };
    }
    const j = (await r.json()) as {
      results?: { title?: string; url?: string; content?: string }[];
    };
    const snippets = (j.results ?? []).map((row) => ({
      title: row.title ?? "",
      url: row.url ?? "",
      snippet: (row.content ?? "").slice(0, 400),
    }));
    return { query: q, snippets, source: "TAVILY" };
  }
}
