"use client";

import type { ScannerSnapshot } from "@/lib/queries/scanner-snapshot";
import type { StrategyCandidate } from "@/lib/engines/strategy-engine";
import { wouldMeetAlertThreshold } from "@/lib/scan/alert-eligibility";
import { ConfidenceBadge } from "./ConfidenceBadge";

export function TodaysBestIdeaCard({
  top,
  snap,
  onOpenRationale,
  onCopy,
  pulse,
}: {
  top: StrategyCandidate | undefined;
  snap: ScannerSnapshot;
  onOpenRationale: () => void;
  onCopy: () => void;
  pulse?: boolean;
}) {
  if (!top) {
    return (
      <div className="card border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted)]">
        <h2 className="text-base font-semibold text-foreground">Today&apos;s best idea</h2>
        <p className="mt-2">No TRADE candidate on this run — nothing ranked at the top.</p>
      </div>
    );
  }

  const meets = wouldMeetAlertThreshold(
    top.confidence,
    snap.minTradeAlertConfidence,
    snap.alertsHighConvictionOnly,
  );

  return (
    <div
      className={`card relative overflow-hidden border border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 via-transparent to-violet-500/10 p-4 transition-shadow duration-500 ${
        pulse ? "shadow-[0_0_28px_-6px_rgba(251,191,36,0.5)]" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-medium uppercase tracking-wide text-cyan-200/90">
            Today&apos;s best idea
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-2xl font-semibold text-foreground">{top.symbol}</span>
            <ConfidenceBadge value={top.confidence} />
            <span className="text-xs text-[var(--muted)]">Risk {top.riskScore.toFixed(1)}</span>
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Rank #{1} · {top.strategyViewTag.replace(/_/g, " ")}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${
            meets ? "bg-emerald-500/25 text-emerald-100" : "bg-black/30 text-[var(--muted)]"
          }`}
        >
          {meets ? "Alert-ready" : "Below alert bar"}
        </span>
      </div>

      <div className="mt-3">
        <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Strongest catalyst (top name)</p>
        <p className="mt-1 text-sm leading-snug text-foreground">{top.catalystSummary || top.thesis}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpenRationale}
          className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/15"
        >
          Open full rationale
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-white/5"
        >
          Copy trade idea
        </button>
      </div>
    </div>
  );
}
