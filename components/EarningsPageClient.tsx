"use client";

import { useCallback } from "react";
import type { EarningsRow } from "@/lib/adapters/types";
import type { EarningsCacheRow } from "@/lib/serializers/earnings-cache";
import type { DataStackSummary } from "@/lib/adapters/provider-factory";
import { ProviderStackPanel } from "@/components/ProviderStackPanel";
import { AiActivityPanel } from "@/components/live-scan/AiActivityPanel";
import { AlertCandidateCard } from "@/components/live-scan/AlertCandidateCard";
import { DecisionStreamPanel } from "@/components/live-scan/DecisionStreamPanel";
import { LastRunSummaryCard } from "@/components/live-scan/LastRunSummaryCard";
import { LiveDeskToolbar } from "@/components/live-scan/LiveDeskToolbar";
import { ScanMetricsCard } from "@/components/live-scan/ScanMetricsCard";
import { useLiveDesk } from "@/components/live-scan/useLiveDesk";

export function EarningsPageClient({
  stack,
  rows,
  cached,
  adapterOk,
  scanLabelHint,
}: {
  stack: DataStackSummary;
  rows: EarningsRow[];
  cached: EarningsCacheRow[];
  adapterOk: boolean;
  scanLabelHint: string;
}) {
  const desk = useLiveDesk();
  const {
    scanning,
    steps,
    lines,
    summary,
    metrics,
    lastSnapshot,
    lastCompletedAt,
    error,
    runScan,
    pulseHighlight,
    pulseScanDone,
  } = desk;

  const runFull = useCallback(() => runScan(), [runScan]);
  const timing = metrics ?? summary?.timing ?? null;
  const snap = lastSnapshot;

  const scanLabel =
    snap?.universe?.length != null && snap.universe.length > 0
      ? `${snap.universe.length} symbols`
      : scanLabelHint;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Earnings calendar</h1>
      <ProviderStackPanel stack={stack} />
      <p className="text-sm text-[var(--muted)]">
        Finnhub earnings calendar and DB cache. Use <strong>Run AI scan now</strong> to replay the
        full strict engine on your watchlist (same as the scanner).
      </p>

      <LiveDeskToolbar desk={desk} scanLabel={scanLabel} onRunScan={runFull} />
      {error && (
        <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      )}

      <AiActivityPanel steps={steps} scanning={scanning} />

      <div className="grid gap-3 xl:grid-cols-4">
        <div className="xl:col-span-2">
          <DecisionStreamPanel lines={lines} />
        </div>
        <LastRunSummaryCard
          summary={summary}
          scanMeta={snap?.scanMeta ?? null}
          lastCompletedAt={lastCompletedAt}
          initialLoadNote={!lastCompletedAt ? "Run a scan to populate summary." : undefined}
          className={
            pulseScanDone
              ? "ring-2 ring-cyan-500/35 shadow-[0_0_22px_-8px_rgba(34,211,238,0.4)]"
              : ""
          }
        />
        <ScanMetricsCard metrics={timing} />
      </div>

      {snap && (
        <AlertCandidateCard
          top={snap.candidates[0]}
          minTradeAlertConfidence={snap.minTradeAlertConfidence}
          alertsHighConvictionOnly={snap.alertsHighConvictionOnly}
          pulse={pulseHighlight}
        />
      )}

      {!adapterOk && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          This strategy is unavailable because required real data is missing. Set{" "}
          <code className="text-foreground">FINNHUB_API_KEY</code> for the earnings calendar.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="text-sm font-medium text-[var(--muted)]">Adapter (Finnhub)</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {rows.map((r) => (
              <li key={r.symbol + (r.datetimeUtc ?? "")} className="flex justify-between">
                <span>
                  {r.symbol}{" "}
                  <span className="text-xs text-[var(--muted)]">({r.source})</span>
                </span>
                <span className="text-[var(--muted)]">
                  {r.datetimeUtc?.slice(0, 10) ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-4">
          <h2 className="text-sm font-medium text-[var(--muted)]">Database cache</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {cached.map((e) => (
              <li key={e.id} className="flex justify-between">
                <span>
                  {e.symbol}{" "}
                  <span className="text-xs text-[var(--muted)]">({e.dataSource})</span>
                </span>
                <span className="text-[var(--muted)]">
                  {e.datetimeUtc?.slice(0, 10) ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
