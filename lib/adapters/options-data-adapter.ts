import type { OptionChain } from "./types";

export interface OptionsDataAdapter {
  getChain(
    underlying: string,
    expiryHint?: string,
    exchange?: string,
  ): Promise<OptionChain | null>;
}

/** Real Polygon options snapshot only — no mock chains. */
export class PolygonOptionsDataAdapter implements OptionsDataAdapter {
  constructor(private apiKey: string) {}

  async getChain(underlying: string): Promise<OptionChain | null> {
    const url = `https://api.polygon.io/v3/snapshot/options/${underlying}?apiKey=${this.apiKey}&limit=250`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = (await r.json()) as {
      results?: {
        details?: {
          strike_price?: number;
          expiration_date?: string;
          contract_type?: string;
        };
        day?: { close?: number; volume?: number };
        open_interest?: number;
        implied_volatility?: number;
        last_quote?: { bid?: number; ask?: number };
      }[];
    };
    const strikes = (j.results ?? []).flatMap((row) => {
      const d = row.details;
      const bid = row.last_quote?.bid ?? 0;
      const ask = row.last_quote?.ask ?? 0;
      if (!d?.strike_price || !d.expiration_date) return [];
      if (bid <= 0 || ask <= 0 || ask < bid) return [];
      const right = d.contract_type === "put" ? ("P" as const) : ("C" as const);
      return [
        {
          strike: d.strike_price,
          expiry: d.expiration_date,
          right,
          bid,
          ask,
          last: row.day?.close,
          openInterest: row.open_interest,
          volume: row.day?.volume,
          impliedVol: row.implied_volatility,
          source: "POLYGON",
        },
      ];
    });
    if (!strikes.length) return null;
    return { underlying, asOf: new Date().toISOString(), strikes, source: "POLYGON" };
  }
}
