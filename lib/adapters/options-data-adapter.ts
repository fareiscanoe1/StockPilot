import type { OptionChain } from "./types";

export interface OptionChainProbe {
  chain: OptionChain | null;
  httpStatus: number | null;
  providerMessage: string | null;
  totalContracts: number;
  liquidContracts: number;
}

export interface OptionsDataAdapter {
  getChain(
    underlying: string,
    expiryHint?: string,
    exchange?: string,
  ): Promise<OptionChain | null>;
  getChainProbe?(
    underlying: string,
    expiryHint?: string,
    exchange?: string,
  ): Promise<OptionChainProbe>;
}

/** Real Polygon options snapshot only — no mock chains. */
export class PolygonOptionsDataAdapter implements OptionsDataAdapter {
  constructor(private apiKey: string) {}

  async getChain(underlying: string): Promise<OptionChain | null> {
    const probe = await this.getChainProbe(underlying);
    return probe.chain;
  }

  async getChainProbe(underlying: string): Promise<OptionChainProbe> {
    const url = `https://api.polygon.io/v3/snapshot/options/${underlying}?apiKey=${this.apiKey}&limit=250`;
    const r = await fetch(url);
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      let providerMessage: string | null = null;
      try {
        const parsed = JSON.parse(text) as { message?: string; error?: string };
        providerMessage = parsed.message ?? parsed.error ?? text.slice(0, 240);
      } catch {
        providerMessage = text.slice(0, 240) || null;
      }
      return {
        chain: null,
        httpStatus: r.status,
        providerMessage,
        totalContracts: 0,
        liquidContracts: 0,
      };
    }
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
    const totalContracts = (j.results ?? []).length;
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
    if (!strikes.length) {
      return {
        chain: null,
        httpStatus: r.status,
        providerMessage: "Polygon returned contracts, but none passed live bid/ask liquidity filters.",
        totalContracts,
        liquidContracts: 0,
      };
    }
    return {
      chain: { underlying, asOf: new Date().toISOString(), strikes, source: "POLYGON" },
      httpStatus: r.status,
      providerMessage: null,
      totalContracts,
      liquidContracts: strikes.length,
    };
  }
}
