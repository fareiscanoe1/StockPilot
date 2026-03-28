import type { SymbolDeskPhase } from "@/lib/scan/types";

export function symbolDeskPhaseLabel(p: SymbolDeskPhase | undefined): string {
  if (!p) return "—";
  const m: Record<SymbolDeskPhase, string> = {
    queued: "Queued",
    fetching: "Fetching",
    filtered: "Filtered",
    openai: "OpenAI",
    completed: "Done",
    stopped: "Stopped",
  };
  return m[p] ?? "—";
}

export const AI_ACTIVITY_STEPS: { id: string; label: string }[] = [
  { id: "fetch_quotes", label: "Fetching quotes" },
  { id: "earnings_window", label: "Checking earnings window" },
  { id: "options_chain", label: "Fetching options chain" },
  { id: "liquidity_filters", label: "Running liquidity filters" },
  { id: "openai", label: "Calling OpenAI for decision" },
  { id: "ranking", label: "Ranking candidates" },
  { id: "trade_journal", label: "Writing trade journal" },
  { id: "alerts", label: "Sending alerts" },
];

export type StepStatus = "running" | "done" | "skipped" | "failed" | "idle";

export function stepStatusLabel(s: StepStatus): string {
  switch (s) {
    case "running":
      return "…";
    case "done":
      return "OK";
    case "skipped":
      return "Skip";
    case "failed":
      return "Fail";
    default:
      return "—";
  }
}
