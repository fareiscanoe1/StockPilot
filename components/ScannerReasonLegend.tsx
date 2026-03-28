const REASON_HELP: Record<string, string> = {
  MISSING_MARKET_ADAPTER: "No market adapter configured (API keys).",
  QUOTE_PROVIDER_NULL: "getQuote returned null — provider had no usable snapshot.",
  QUOTE_NORMALIZATION_FAILED: "Quote object present but last price invalid after parsing.",
  INSUFFICIENT_CANDLE_HISTORY: "Not enough daily candles for the scan window.",
  MISSING_STOCK_VOLUME: "Volume missing or zero on the equity quote.",
  STOCK_LIQUIDITY_RULE_FAIL: "Stock failed volume or spread (when NBBO present) rules.",
  OPTIONS_MODULE_DISABLED_NO_POLYGON: "Options mode requires Polygon options adapter.",
  OPTIONS_CHAIN_UNAVAILABLE: "No options chain returned for the underlying.",
  OPTIONS_CONTRACT_NBBO_MISSING:
    "Chain loaded but no strike had both bid and ask (options NBBO required).",
  OPTIONS_NO_QUALIFYING_STRIKE:
    "NBBO present but no strike passed spread, OI, contract volume, and DTE window.",
  OPTIONS_SPREAD_TOO_WIDE: "Deprecated — see OPTIONS_NO_QUALIFYING_STRIKE.",
  OPTIONS_NO_LIQUID_CONTRACT: "Deprecated — see OPTIONS_NO_QUALIFYING_STRIKE.",
  STOCK_MIN_PRICE_FAIL: "Last price below mode minimum (penny / junk filter).",
  STOCK_TREND_RULE_FAIL: "Trend score below minimum for long-bias stock entry.",
  EARNINGS_PROXIMITY_FAIL: "Earnings date outside allowed day window for earnings mode.",
  EARNINGS_ADAPTER_MISSING: "Earnings calendar adapter not available.",
  EARNINGS_DATE_UNAVAILABLE_FOR_SYMBOL: "Symbol not in upcoming earnings window.",
  SCORE_BELOW_THRESHOLD: "Heuristic score below internal gate.",
  POSITION_SIZE_RULE_FAIL: "Proposed size exceeds risk limits.",
  OPENAI_REASONING_UNAVAILABLE: "OPENAI_API_KEY not set.",
  OPENAI_REASONING_FAILED: "OpenAI call or JSON schema failed.",
  OPENAI_DECISION_NO_TRADE: "Model returned NO_TRADE for this snapshot.",
};

export function ScannerReasonLegend() {
  return (
    <details className="card p-3 text-xs text-[var(--muted)]">
      <summary className="cursor-pointer font-medium text-foreground">
        Reason codes (NO_TRADE)
      </summary>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        {Object.entries(REASON_HELP).map(([code, text]) => (
          <div key={code}>
            <dt className="font-mono text-[10px] text-foreground">{code}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-[var(--border)] pt-2 text-[10px]">
        Underlying stocks: if NBBO is missing, the engine uses last price for spread context and
        applies volume-only liquidity when bid/ask are absent. Options still require per-strike
        bid/ask.
      </p>
    </details>
  );
}
