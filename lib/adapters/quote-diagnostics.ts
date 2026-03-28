/**
 * One-off raw HTTP captures for scanner debug UI (does not replace adapter normalization).
 */
export interface SymbolQuoteDiagnostics {
  symbol: string;
  /** Quote from the same adapter stack as production (`getResolvedStrictProviders().market`). */
  normalizedPipeline: import("./types").Quote | null;
  raw: {
    polygonSnapshot?: unknown;
    polygonSnapshotOk?: boolean;
    polygonNbbo?: unknown;
    polygonNbboOk?: boolean;
    finnhubQuote?: unknown;
    finnhubQuoteOk?: boolean;
    finnhubBidAsk?: unknown;
    finnhubBidAskOk?: boolean;
  };
  notes: string[];
}

function note(notes: string[], msg: string) {
  notes.push(msg);
}

export async function fetchSymbolQuoteDiagnostics(
  symbol: string,
  polygonKey: string | undefined,
  finnhubKey: string | undefined,
  normalizedFromPipeline: import("./types").Quote | null,
): Promise<SymbolQuoteDiagnostics> {
  const sym = symbol.toUpperCase();
  const notes: string[] = [];
  const raw: SymbolQuoteDiagnostics["raw"] = {};

  if (polygonKey) {
    const snapUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${sym}?apiKey=${polygonKey}`;
    try {
      const r = await fetch(snapUrl);
      raw.polygonSnapshotOk = r.ok;
      raw.polygonSnapshot = await r.json().catch(() => ({ parseError: true }));
      if (!r.ok) note(notes, `Polygon snapshot HTTP ${r.status}`);
    } catch (e) {
      note(notes, `Polygon snapshot fetch error: ${String(e)}`);
    }

    const nbboUrl = `https://api.polygon.io/v2/last/nbbo/${encodeURIComponent(sym)}?apiKey=${polygonKey}`;
    try {
      const r = await fetch(nbboUrl);
      raw.polygonNbboOk = r.ok;
      raw.polygonNbbo = await r.json().catch(() => ({ parseError: true }));
      if (!r.ok) note(notes, `Polygon NBBO HTTP ${r.status}`);
    } catch (e) {
      note(notes, `Polygon NBBO fetch error: ${String(e)}`);
    }
  } else {
    note(notes, "POLYGON_API_KEY not set — skipped Polygon raw calls.");
  }

  if (finnhubKey) {
    const qUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${finnhubKey}`;
    try {
      const r = await fetch(qUrl);
      raw.finnhubQuoteOk = r.ok;
      raw.finnhubQuote = await r.json().catch(() => ({ parseError: true }));
      if (!r.ok) note(notes, `Finnhub quote HTTP ${r.status}`);
    } catch (e) {
      note(notes, `Finnhub quote fetch error: ${String(e)}`);
    }

    const bUrl = `https://finnhub.io/api/v1/stock/bidask?symbol=${encodeURIComponent(sym)}&token=${finnhubKey}`;
    try {
      const r = await fetch(bUrl);
      raw.finnhubBidAskOk = r.ok;
      raw.finnhubBidAsk = await r.json().catch(() => ({ parseError: true }));
      if (!r.ok) note(notes, `Finnhub bid/ask HTTP ${r.status}`);
    } catch (e) {
      note(notes, `Finnhub bid/ask fetch error: ${String(e)}`);
    }
  } else {
    note(notes, "FINNHUB_API_KEY not set — skipped Finnhub raw calls.");
  }

  if (normalizedFromPipeline) {
    if (
      normalizedFromPipeline.bid == null ||
      normalizedFromPipeline.ask == null ||
      normalizedFromPipeline.bid <= 0 ||
      normalizedFromPipeline.ask < normalizedFromPipeline.bid
    ) {
      note(notes, "Normalized pipeline quote has no usable NBBO (last may still be present).");
    }
  } else {
    note(notes, "Normalized pipeline returned null.");
  }

  return {
    symbol: sym,
    normalizedPipeline: normalizedFromPipeline,
    raw,
    notes,
  };
}
