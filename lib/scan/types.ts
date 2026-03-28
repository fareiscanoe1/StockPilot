/**
 * Streamed scan events for live desk UI (SSE). Keep JSON-serializable.
 */
export type SymbolDeskPhase =
  | "queued"
  | "fetching"
  | "filtered"
  | "openai"
  | "completed"
  | "stopped";

export type ScanTimingKind = "quote" | "openai" | "symbol";

export interface ScanTimingMetrics {
  wallClockMs: number;
  avgSymbolMs: number;
  avgOpenAiMs: number;
  openAiSamples: number;
  avgQuoteMs: number;
  quoteSamples: number;
}

export type ScanStreamEvent =
  | {
      type: "step";
      stepId: string;
      status: "running" | "done" | "skipped" | "failed";
      label?: string;
    }
  | {
      type: "log";
      message: string;
      symbol?: string;
      level?: "info" | "ok" | "warn" | "error";
    }
  | { type: "openai_start"; symbol: string }
  | {
      type: "openai_result";
      symbol: string;
      decision: "TRADE" | "NO_TRADE";
      confidence?: number;
      no_trade_reason?: string;
    }
  | {
      type: "scan_begin";
      symbols: string[];
      alertPrefs?: {
        minTradeAlertConfidence: number | null;
        alertsHighConvictionOnly: boolean;
      };
    }
  | { type: "symbol_progress"; symbol: string; phase: SymbolDeskPhase }
  | {
      type: "timing";
      kind: ScanTimingKind;
      symbol: string;
      ms: number;
    }
  | { type: "scan_metrics"; data: ScanTimingMetrics }
  | { type: "summary"; data: LiveScanSummary }
  | { type: "complete"; snapshot: Record<string, unknown> }
  | { type: "error"; message: string };

export interface LiveScanSummary {
  finishedAt: string;
  symbolsChecked: number;
  passedToOpenAi: number;
  openAiCalls: number;
  stockCandidates: number;
  optionCandidates: number;
  tradeDecisions: number;
  /** Scan API does not execute paper orders; worker/cron sends alerts. */
  tradeAlertsSentNote: string;
  timing?: ScanTimingMetrics;
  minTradeAlertConfidence?: number | null;
  alertsHighConvictionOnly?: boolean;
}

export type ScanTelemetryFn = (event: ScanStreamEvent) => void;
