import type { StrategyCandidate } from "@/lib/engines/strategy-engine";

/** Reasons this TRADE candidate would not trigger a worker alert (preview scan never sends). */
export function whyNotAlertedLines(
  candidate: StrategyCandidate | undefined,
  minTradeAlertConfidence: number | null,
  alertsHighConvictionOnly: boolean,
): string[] {
  if (!candidate) {
    return ["No ranked TRADE candidate on this run."];
  }

  const c = candidate.confidence;
  const lines: string[] = [];

  if (minTradeAlertConfidence != null && c < minTradeAlertConfidence) {
    lines.push(
      `Confidence ${c.toFixed(1)} is below your minimum trade alert threshold (${minTradeAlertConfidence}).`,
    );
  }

  if (alertsHighConvictionOnly && c < 7) {
    lines.push(
      "“High conviction only” is enabled — alerts require confidence ≥ 7 in addition to your min threshold.",
    );
  }

  const nbbo = candidate.facts.underlyingNbboObserved === true;
  if (!nbbo) {
    lines.push(
      "Underlying NBBO was not observed (volume-only / last proxy). The worker may be more conservative on fills.",
    );
  }

  const sp = candidate.facts.spreadPct as number | undefined;
  if (typeof sp === "number" && sp > 1.25) {
    lines.push(`Stock bid/ask spread is wide (${sp.toFixed(2)}%) — liquidity may be weak for alerts.`);
  }

  if (candidate.assetType === "OPTION") {
    lines.push(
      "Option alerts depend on Polygon chain NBBO and your option liquidity gates — verify chain quality.",
    );
  }

  if (lines.length === 0) {
    lines.push(
      "This candidate would be eligible for worker review on the next cron scan if it stays top-ranked and data vendors stay healthy.",
    );
  }

  lines.push("Preview scans never send push alerts — only the scan worker / cron does.");

  return lines;
}

export function wouldMeetAlertThreshold(
  confidence: number,
  minTradeAlertConfidence: number | null,
  alertsHighConvictionOnly: boolean,
): boolean {
  if (alertsHighConvictionOnly && confidence < 7) return false;
  if (minTradeAlertConfidence != null && confidence < minTradeAlertConfidence) return false;
  return true;
}
