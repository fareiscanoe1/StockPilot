import type {
  StrictDecisionRecord,
  StrategyCandidate,
} from "@/lib/engines/strategy-engine";

export type ScannerNbboBadgeKind =
  | "NBBO_LIVE"
  | "VOLUME_ONLY"
  | "FINNHUB_NBBO_FALLBACK";

export function scannerNbboBadgeFromFacts(facts: Record<string, unknown>): {
  kind: ScannerNbboBadgeKind;
  label: string;
  className: string;
} {
  const src = facts.stockBidAskSource as string | null | undefined;
  const nbboObserved = facts.underlyingNbboObserved === true;

  if (src === "FINNHUB_BIDASK") {
    return {
      kind: "FINNHUB_NBBO_FALLBACK",
      label: "Finnhub bid/ask",
      className:
        "rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-100",
    };
  }
  if (nbboObserved) {
    return {
      kind: "NBBO_LIVE",
      label: "NBBO live",
      className:
        "rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-100",
    };
  }
  return {
    kind: "VOLUME_ONLY",
    label: "Volume-only liq.",
    className:
      "rounded border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-100",
  };
}

export function provenanceTooltipFromCandidate(c: StrategyCandidate): string {
  const p = c.facts.provenance as Record<string, string | null> | undefined;
  const nbbo = c.facts.underlyingNbboObserved === true;
  const bas = (c.facts.stockBidAskSource as string | null | undefined) ?? null;
  const bidAskLine = nbbo
    ? `Bid/ask source: ${bas ?? "NBBO (vendor)"}`
    : "Bid/ask: not observed — last used for context; volume-only liquidity gate";
  return [
    `Last / quote vendor: ${p?.quotes ?? "—"}`,
    bidAskLine,
    `Candles: ${p?.candles ?? "—"}`,
    `Earnings calendar: ${p?.earningsCalendar ?? "—"}`,
    `News: ${p?.news ?? "—"}`,
    `Options chain: ${p?.optionsChain ?? "—"}`,
    `Open web: ${p?.webResearch ?? "—"}`,
    `AI: ${p?.reasoning ?? "—"}`,
  ].join("\n");
}

export function provenanceTooltipFromDecision(d: StrictDecisionRecord): string {
  const p = d.provenance;
  const nbbo = p.underlyingNbboObserved === "true";
  const bas = p.stockBidAskSource ?? null;
  const bidAskLine = nbbo
    ? `Bid/ask source: ${bas ?? "NBBO"}`
    : p.underlyingNbboObserved === "false"
      ? "Bid/ask: not observed — last proxy / volume-only gate"
      : `Bid/ask source: ${bas ?? "—"}`;
  return [
    `Quotes stack: ${p.quotes ?? "—"}`,
    bidAskLine,
    `Candles stack: ${p.candles ?? "—"}`,
    `Fundamentals: ${p.fundamentals ?? "—"}`,
    `Earnings: ${p.earningsCalendar ?? "—"}`,
    `News: ${p.news ?? "—"}`,
    `Options: ${p.optionsChain ?? "—"}`,
    `Web research: ${p.webResearch ?? "—"}`,
    d.sourcesUsed.quoteVendor
      ? `Quote vendor (used): ${d.sourcesUsed.quoteVendor}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Options-related NO_TRADE reasons (underlying equity uses different codes). */
export const OPTION_SPECIFIC_REASON_CODES = new Set([
  "OPTIONS_MODULE_DISABLED_NO_POLYGON",
  "OPTIONS_CHAIN_UNAVAILABLE",
  "OPTIONS_CONTRACT_NBBO_MISSING",
  "OPTIONS_NO_QUALIFYING_STRIKE",
  "OPTIONS_SPREAD_TOO_WIDE",
  "OPTIONS_NO_LIQUID_CONTRACT",
]);
