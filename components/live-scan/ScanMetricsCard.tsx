"use client";

import type { ScanTimingMetrics } from "@/lib/scan/types";

function fmt(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function ScanMetricsCard({ metrics }: { metrics: ScanTimingMetrics | null }) {
  if (!metrics) {
    return (
      <div className="card p-3 text-xs text-[var(--muted)]">
        Timing metrics appear after a live scan (wall clock, per-symbol, quotes, OpenAI).
      </div>
    );
  }

  return (
    <div className="card p-3 text-xs">
      <h2 className="text-sm font-medium text-foreground">Scan timing</h2>
      <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div>
          <dt className="text-[var(--muted)]">Total run</dt>
          <dd className="font-mono text-foreground">{fmt(metrics.wallClockMs)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Avg / symbol</dt>
          <dd className="font-mono text-foreground">{fmt(metrics.avgSymbolMs)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Avg quote fetch</dt>
          <dd className="font-mono text-foreground">{fmt(metrics.avgQuoteMs)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Avg OpenAI</dt>
          <dd className="font-mono text-foreground">
            {metrics.openAiSamples ? fmt(metrics.avgOpenAiMs) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">OpenAI calls</dt>
          <dd className="font-mono text-foreground">{metrics.openAiSamples}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Quote samples</dt>
          <dd className="font-mono text-foreground">{metrics.quoteSamples}</dd>
        </div>
      </dl>
    </div>
  );
}
