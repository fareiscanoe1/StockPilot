import type { DataStackSummary } from "@/lib/adapters/provider-factory";

export type RealDataPanelStatus = "real" | "blocked";

export function panelRealDataStatus(
  stack: DataStackSummary | undefined,
  kind: "market" | "options" | "earnings" | "reasoning" | "crypto",
): { status: RealDataPanelStatus; detail: string } {
  if (!stack) {
    return { status: "blocked", detail: "No data stack summary — scan required." };
  }
  switch (kind) {
    case "market":
      if (stack.quotes === "unavailable" || stack.candles === "unavailable") {
        return {
          status: "blocked",
          detail: `Quotes: ${stack.quotes}; candles: ${stack.candles}`,
        };
      }
      return { status: "real", detail: `${stack.quotes} · ${stack.candles}` };
    case "options":
      if (stack.options === "unavailable") {
        return { status: "blocked", detail: "Options adapter unavailable (STRICT)." };
      }
      return { status: "real", detail: stack.options };
    case "earnings":
      if (stack.earnings === "unavailable") {
        return { status: "blocked", detail: "Earnings adapter unavailable." };
      }
      return { status: "real", detail: stack.earnings };
    case "reasoning":
      if (stack.reasoning === "unavailable") {
        return { status: "blocked", detail: "OpenAI reasoning layer unavailable." };
      }
      return { status: "real", detail: stack.reasoning };
    case "crypto":
      return {
        status: "blocked",
        detail: "No crypto market-data adapter in STRICT stack — enable only when wired.",
      };
    default:
      return { status: "blocked", detail: "Unknown panel." };
  }
}

export function formatRealDataLabel(s: { status: RealDataPanelStatus; detail: string }): string {
  return s.status === "real" ? `REAL DATA USED — ${s.detail}` : `BLOCKED: REQUIRED REAL DATA MISSING — ${s.detail}`;
}
