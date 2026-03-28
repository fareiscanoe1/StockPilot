import type { ScannerSnapshot } from "@/lib/queries/scanner-snapshot";
import type { ScanTimingMetrics } from "@/lib/scan/types";
import type { StrictDecisionRecord } from "@/lib/engines/strategy-engine";
import { REASON } from "@/lib/engines/strategy-engine";

export type ProviderHealthStatus = "ok" | "slow" | "failed";

export interface ProviderHealthItem {
  id: "polygon" | "finnhub" | "openai";
  label: string;
  status: ProviderHealthStatus;
  detail: string;
}

function unavail(s: string): boolean {
  return !s || /unavailable|missing|none/i.test(s);
}

export function providerHealthFromScan(
  snap: ScannerSnapshot,
  timing: ScanTimingMetrics | null,
  decisions: StrictDecisionRecord[],
): ProviderHealthItem[] {
  const stack = snap.dataSources;

  let polygon: ProviderHealthStatus = "ok";
  let polygonDetail = stack.options;
  if (unavail(stack.options) || stack.warnings.some((w) => /polygon|options/i.test(w))) {
    polygon = "failed";
    polygonDetail = "Options / Polygon not configured or blocked";
  } else if (
    decisions.some(
      (d) =>
        d.reasonCode === REASON.OPTIONS_MODULE_DISABLED_NO_POLYGON ||
        d.reasonCode === REASON.OPTIONS_CHAIN_UNAVAILABLE ||
        d.reasonCode === REASON.OPTIONS_CONTRACT_NBBO_MISSING ||
        d.reasonCode === REASON.OPTIONS_NO_QUALIFYING_STRIKE,
    )
  ) {
    polygon = "slow";
    polygonDetail = "Some symbols failed Polygon / options liquidity checks";
  }
  if (timing && timing.avgQuoteMs > 450 && polygon !== "failed") {
    polygon = "slow";
    polygonDetail = `Quote fetches averaging ${Math.round(timing.avgQuoteMs)} ms`;
  }

  let finn: ProviderHealthStatus = "ok";
  let finnDetail = `${stack.quotes} · ${stack.earnings}`;
  if (unavail(stack.quotes) && unavail(stack.candles)) {
    finn = "failed";
    finnDetail = "Finnhub / market stack unavailable";
  } else if (
    decisions.some(
      (d) =>
        d.reasonCode === REASON.EARNINGS_ADAPTER_MISSING ||
        d.reasonCode === REASON.QUOTE_PROVIDER_NULL,
    )
  ) {
    finn = "slow";
    finnDetail = "Some Finnhub or quote paths failed for symbols";
  }

  let openai: ProviderHealthStatus = "ok";
  let openaiDetail = stack.reasoning;
  const oaFail = decisions.filter((d) => d.reasonCode === REASON.OPENAI_REASONING_FAILED).length;
  const oaOff = decisions.filter((d) => d.reasonCode === REASON.OPENAI_REASONING_UNAVAILABLE).length;
  if (oaOff === decisions.length && decisions.length > 0) {
    openai = "failed";
    openaiDetail = "OpenAI key missing — no reasoning";
  } else if (oaFail > 0) {
    openai = oaFail >= Math.max(1, Math.floor(decisions.length / 2)) ? "failed" : "slow";
    openaiDetail = `${oaFail} OpenAI call(s) failed`;
  }
  if (timing && timing.openAiSamples > 0 && timing.avgOpenAiMs > 4500 && openai === "ok") {
    openai = "slow";
    openaiDetail = `Avg OpenAI latency ${Math.round(timing.avgOpenAiMs)} ms`;
  }

  return [
    { id: "polygon", label: "Polygon", status: polygon, detail: polygonDetail },
    { id: "finnhub", label: "Finnhub / market", status: finn, detail: finnDetail },
    { id: "openai", label: "OpenAI", status: openai, detail: openaiDetail },
  ];
}
