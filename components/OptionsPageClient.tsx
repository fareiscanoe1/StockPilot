"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { OptionChain } from "@/lib/adapters/types";
import type { DataStackSummary } from "@/lib/adapters/provider-factory";
import { ProviderStackPanel } from "@/components/ProviderStackPanel";
import { AiActivityPanel } from "@/components/live-scan/AiActivityPanel";
import { AlertCandidateCard } from "@/components/live-scan/AlertCandidateCard";
import { DecisionStreamPanel } from "@/components/live-scan/DecisionStreamPanel";
import { LastRunSummaryCard } from "@/components/live-scan/LastRunSummaryCard";
import { LiveDeskToolbar } from "@/components/live-scan/LiveDeskToolbar";
import { ScanMetricsCard } from "@/components/live-scan/ScanMetricsCard";
import { useLiveDesk } from "@/components/live-scan/useLiveDesk";

export function OptionsPageClient({
  stack,
  serverSymbol,
  initialChain,
  optionsDisabled,
}: {
  stack: DataStackSummary;
  serverSymbol: string;
  initialChain: OptionChain | null;
  optionsDisabled: boolean;
}) {
  const params = useSearchParams();
  const urlSymbol = params.get("symbol");
  const symbol = (
    (urlSymbol && urlSymbol.trim()) ||
    serverSymbol ||
    "AAPL"
  )
    .trim()
    .toUpperCase() || "AAPL";

  const [chain, setChain] = useState<OptionChain | null>(initialChain);
  const prevSymbol = useRef<string | null>(null);

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

  const timing = metrics ?? summary?.timing ?? null;
  const snap = lastSnapshot;

  const refreshChain = useCallback(async () => {
    const r = await fetch(`/api/options?symbol=${encodeURIComponent(symbol)}`);
    if (!r.ok) return;
    const j = (await r.json()) as { chain: OptionChain | null };
    setChain(j.chain);
  }, [symbol]);

  useEffect(() => {
    if (prevSymbol.current === null) {
      prevSymbol.current = symbol;
      return;
    }
    if (prevSymbol.current === symbol) return;
    prevSymbol.current = symbol;
    void refreshChain();
  }, [symbol, refreshChain]);

  useEffect(() => {
    if (!lastCompletedAt) return;
    void refreshChain();
  }, [lastCompletedAt, refreshChain]);

  const runOptionsScan = useCallback(() => {
    void runScan({ symbol });
  }, [runScan, symbol]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Options opportunities</h1>
      <ProviderStackPanel stack={stack} title="Options require Polygon" />
      <p className="text-sm text-[var(--muted)]">
        Chain snapshot for liquidity screening. The symbol in the URL, the table below, and the AI
        scan use the same ticker.
      </p>
      <p className="text-xs text-[var(--muted)]">
        Query: <code className="text-foreground">?symbol=AAPL</code> — default{" "}
        <code className="text-foreground">AAPL</code> when omitted.
      </p>

      <LiveDeskToolbar desk={desk} scanLabel={symbol} onRunScan={runOptionsScan} />
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

      {optionsDisabled && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          This strategy is unavailable because required real data is missing. Set{" "}
          <code className="text-foreground">POLYGON_API_KEY</code> for live options chains.
        </p>
      )}

      <div className="card overflow-auto">
        <div className="border-b border-[var(--border)] bg-black/20 px-3 py-2 text-xs text-[var(--muted)]">
          Polygon chain for <span className="font-mono text-foreground">{symbol}</span>
          {chain?.underlying && chain.underlying.toUpperCase() !== symbol ? (
            <span className="ml-2 text-amber-200/90">
              (underlying in payload: {chain.underlying})
            </span>
          ) : null}
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] text-xs text-[var(--muted)]">
            <tr>
              <th className="p-2">Strike</th>
              <th className="p-2">Expiry</th>
              <th className="p-2">R</th>
              <th className="p-2">Bid</th>
              <th className="p-2">Ask</th>
              <th className="p-2">OI</th>
              <th className="p-2">IV</th>
            </tr>
          </thead>
          <tbody>
            {chain?.strikes.map((s, i) => (
              <tr key={i} className="border-b border-[var(--border)]">
                <td className="p-2 font-mono">{s.strike}</td>
                <td className="p-2">{s.expiry}</td>
                <td className="p-2">{s.right}</td>
                <td className="p-2">{s.bid.toFixed(2)}</td>
                <td className="p-2">{s.ask.toFixed(2)}</td>
                <td className="p-2">{s.openInterest ?? "—"}</td>
                <td className="p-2">{s.impliedVol?.toFixed(2) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!chain && !optionsDisabled && (
          <p className="p-4 text-sm text-[var(--muted)]">
            No Polygon chain returned for <span className="font-mono text-foreground">{symbol}</span>{" "}
            (illiquid or unavailable).
          </p>
        )}
      </div>
    </div>
  );
}
