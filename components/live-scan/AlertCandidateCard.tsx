"use client";

import type { StrategyCandidate } from "@/lib/engines/strategy-engine";
import {
  whyNotAlertedLines,
  wouldMeetAlertThreshold,
} from "@/lib/scan/alert-eligibility";

export function AlertCandidateCard({
  top,
  minTradeAlertConfidence,
  alertsHighConvictionOnly,
  pulse,
}: {
  top: StrategyCandidate | undefined;
  minTradeAlertConfidence: number | null;
  alertsHighConvictionOnly: boolean;
  /** Subtle emphasis when a high-signal TRADE just fired. */
  pulse?: boolean;
}) {
  const lines = whyNotAlertedLines(top, minTradeAlertConfidence, alertsHighConvictionOnly);
  const meets =
    top != null &&
    wouldMeetAlertThreshold(
      top.confidence,
      minTradeAlertConfidence,
      alertsHighConvictionOnly,
    );

  if (!top) {
    return (
      <div className="card p-3 text-xs text-[var(--muted)]">
        No TRADE candidate ranked this run — nothing to evaluate for alerts.
      </div>
    );
  }

  return (
    <div
      className={`card p-3 text-xs transition-shadow duration-500 ${
        meets ? "ring-1 ring-emerald-500/35" : "ring-1 ring-[var(--border)]"
      } ${pulse ? "shadow-[0_0_24px_-4px_rgba(251,191,36,0.45)]" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">Latest alert candidate</h2>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
            meets
              ? "bg-emerald-500/20 text-emerald-100"
              : "bg-black/30 text-[var(--muted)]"
          }`}
        >
          {meets ? "Threshold met" : "Below threshold / gated"}
        </span>
      </div>
      <p className="mt-2 font-mono text-lg text-foreground">{top.symbol}</p>
      <dl className="mt-2 grid gap-1.5 text-[11px]">
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--muted)]">Confidence</dt>
          <dd className="font-mono">{top.confidence.toFixed(1)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--muted)]">Strategy</dt>
          <dd className="text-right text-foreground">{top.strategyTag.replace(/_/g, " ")}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--muted)]">View</dt>
          <dd className="text-right text-[var(--muted)]">
            {top.strategyViewTag.replace(/_/g, " ")}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Catalyst</dt>
          <dd className="mt-0.5 text-foreground">{top.catalystSummary || "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Hold period</dt>
          <dd className="mt-0.5 text-[var(--muted)]">{top.holdingPeriodNote || "—"}</dd>
        </div>
      </dl>
      <div className="mt-3 border-t border-[var(--border)] pt-2">
        <p className="text-[10px] font-medium text-[var(--muted)]">Why not alerted? (preview)</p>
        <ul className="mt-1 list-inside list-disc space-y-1 text-[10px] text-[var(--muted)]">
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
