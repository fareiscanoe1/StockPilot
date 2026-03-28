"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlSymbol = params.get("symbol");
  const symbol = (
    (urlSymbol && urlSymbol.trim()) ||
    serverSymbol ||
    ""
  )
    .trim()
    .toUpperCase();

  const [chain, setChain] = useState<OptionChain | null>(initialChain);
  const [symbolDraft, setSymbolDraft] = useState(symbol || "");
  const [chainStatus, setChainStatus] = useState<string>(() => {
    if (optionsDisabled) {
      return "BLOCKED: REQUIRED REAL DATA MISSING — set POLYGON_API_KEY for live options chains.";
    }
    if (!symbol) {
      return "Enter a symbol to fetch a real options chain.";
    }
    if (!initialChain) {
      return `No liquid real chain returned yet for ${symbol}.`;
    }
    return `REAL DATA USED — ${initialChain.strikes.length} liquid strike(s) from Polygon.`;
  });
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
    if (!symbol) {
      setChain(null);
      setChainStatus("Enter a symbol to fetch a real options chain.");
      return;
    }
    const r = await fetch(`/api/options?symbol=${encodeURIComponent(symbol)}`);
    const j = (await r.json()) as {
      ok?: boolean;
      chain: OptionChain | null;
      blockedReason?: string;
      note?: string;
      liquidStrikeCount?: number;
      totalContracts?: number;
      realDataStatus?: string;
      error?: string;
    };
    if (!r.ok) {
      setChain(null);
      setChainStatus(
        j.blockedReason ??
          j.error ??
          `Options API failed (HTTP ${r.status}).`,
      );
      return;
    }
    setChain(j.chain);
    if (j.ok && j.chain) {
      const n = j.liquidStrikeCount ?? j.chain.strikes.length;
      const t = j.totalContracts ?? n;
      setChainStatus(
        `REAL DATA USED — ${n} liquid strike(s) from Polygon (${t} contract(s) fetched).`,
      );
      return;
    }
    setChainStatus(
      j.blockedReason ??
        j.note ??
        `No liquid real chain returned for ${symbol}.`,
    );
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

  useEffect(() => {
    setSymbolDraft(symbol || "");
    if (!symbol) {
      setChainStatus("Enter a symbol to fetch a real options chain.");
    }
  }, [symbol]);

  const runOptionsScan = useCallback(() => {
    if (!symbol) {
      setChainStatus("Cannot run options scan: choose a symbol first.");
      return;
    }
    void runScan({ symbol });
  }, [runScan, symbol]);

  const applySymbol = useCallback(() => {
    const next = symbolDraft.trim().toUpperCase();
    if (!next) {
      setChainStatus("Enter a symbol (e.g. AAPL, NVDA, MSFT).");
      return;
    }
    const qp = new URLSearchParams(params.toString());
    qp.set("symbol", next);
    const query = qp.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`);
  }, [pathname, params, router, symbolDraft]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Options opportunities</h1>
      <ProviderStackPanel stack={stack} title="Options require Polygon" />
      <p className="text-sm text-[var(--muted)]">
        Chain snapshot for liquidity screening. The symbol in the URL, the table below, and the AI
        scan use the same ticker.
      </p>
      <div className="card p-3">
        <p className="text-xs font-medium text-foreground">Live options symbol</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            className="w-44 rounded border border-[var(--border)] bg-black/20 px-2 py-1.5 text-xs text-foreground"
            value={symbolDraft}
            onChange={(e) => setSymbolDraft(e.target.value.toUpperCase())}
            placeholder="AAPL"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applySymbol();
              }
            }}
          />
          <button
            type="button"
            className="rounded border border-[var(--border)] px-3 py-1.5 text-xs text-foreground hover:bg-white/5"
            onClick={applySymbol}
          >
            Load live chain
          </button>
          <span className="text-xs text-[var(--muted)]">
            URL sync: <code className="text-foreground">?symbol=XYZ</code>
          </span>
        </div>
      </div>
      <p className="text-xs text-[var(--muted)]">
        STRICT real-data mode: no mock chains. Missing/illiquid symbols are shown as blocked.
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
          Polygon chain for <span className="font-mono text-foreground">{symbol || "—"}</span>
          <span className="ml-2 text-[11px] text-[var(--accent)]">{chainStatus}</span>
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
            {chainStatus}
          </p>
        )}
      </div>
    </div>
  );
}
