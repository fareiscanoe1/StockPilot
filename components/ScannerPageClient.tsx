"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SymbolDeskPhase } from "@/lib/scan/types";
import type { ScannerSnapshot } from "@/lib/queries/scanner-snapshot";
import type { StrictDecisionRecord, StrategyCandidate } from "@/lib/engines/strategy-engine";
import { ProviderStackPanel } from "@/components/ProviderStackPanel";
import { ScannerQuoteDebugPanel } from "@/components/ScannerQuoteDebugPanel";
import { ScannerReasonLegend } from "@/components/ScannerReasonLegend";
import {
  OPTION_SPECIFIC_REASON_CODES,
  provenanceTooltipFromCandidate,
  provenanceTooltipFromDecision,
  scannerNbboBadgeFromFacts,
} from "@/lib/scanner-display";
import { AiActivityPanel } from "@/components/live-scan/AiActivityPanel";
import { DecisionStreamPanel } from "@/components/live-scan/DecisionStreamPanel";
import { LastRunSummaryCard } from "@/components/live-scan/LastRunSummaryCard";
import { LiveDeskToolbar } from "@/components/live-scan/LiveDeskToolbar";
import { ScanMetricsCard } from "@/components/live-scan/ScanMetricsCard";
import { isProminentConviction } from "@/components/live-scan/conviction";
import { symbolDeskPhaseLabel } from "@/components/live-scan/step-meta";
import { useLiveDesk } from "@/components/live-scan/useLiveDesk";
import { whyNotAlertedLines } from "@/lib/scan/alert-eligibility";
import { ConfidenceBadge } from "@/components/scanner-desk/ConfidenceBadge";
import { DecisionDrawer } from "@/components/scanner-desk/DecisionDrawer";
import { GateChipsRow } from "@/components/scanner-desk/GateChipsRow";
import { ProviderHealthStrip } from "@/components/scanner-desk/ProviderHealthStrip";
import { RejectedChipsRow } from "@/components/scanner-desk/RejectedChipsRow";
import { ScanHistoryPanel } from "@/components/scanner-desk/ScanHistoryPanel";
import { TodaysBestIdeaCard } from "@/components/scanner-desk/TodaysBestIdeaCard";
import { buildCopyTradeIdeaText } from "@/lib/scanner/copy-trade-idea";
import { passedGateChips, rejectedByChips } from "@/lib/scanner/gates-display";
import { providerHealthFromScan } from "@/lib/scanner/provider-health";
import {
  appendScanHistoryEntry,
  loadScanHistory,
  parseHistorySnapshot,
  type ScanHistoryEntry,
} from "@/lib/scanner/scan-history-storage";

function OpenAiStructuredBlock({ c }: { c: StrategyCandidate }) {
  const raw = c.inferences?.openaiStructuredOutput as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") {
    return <p className="text-[var(--muted)]">No structured OpenAI payload on this row.</p>;
  }
  const pick = (k: string) => {
    const v = raw[k];
    return v != null && String(v).trim() !== "" ? String(v) : null;
  };
  return (
    <dl className="grid gap-2 text-[11px] sm:grid-cols-2">
      {[
        ["thesis", pick("thesis")],
        ["no_trade_reason", pick("no_trade_reason")],
        ["catalyst_summary", pick("catalyst_summary")],
        ["holding_period_note", pick("holding_period_note")],
        ["confidence", raw.confidence != null ? String(raw.confidence) : null],
        ["risk_score", raw.risk_score != null ? String(raw.risk_score) : null],
        ["rationale", pick("rationale")],
      ].map(([k, v]) =>
        v && k ? (
          <div key={k}>
            <dt className="text-[var(--muted)]">{k.replace(/_/g, " ")}</dt>
            <dd className="text-foreground">{v}</dd>
          </div>
        ) : null,
      )}
    </dl>
  );
}

export function ScannerPageClient({
  initialSnapshot,
  debugOn,
}: {
  initialSnapshot: ScannerSnapshot;
  debugOn: boolean;
}) {
  const desk = useLiveDesk();
  const {
    scanning,
    steps,
    lines,
    summary,
    metrics,
    symbolProgress,
    lastSnapshot,
    lastCompletedAt,
    error,
    runScan,
    pulseHighlight,
    pulseScanDone,
  } = desk;

  const liveSnap = lastSnapshot ?? initialSnapshot;
  const [historyOverride, setHistoryOverride] = useState<ScannerSnapshot | null>(null);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<ScanHistoryEntry[]>([]);
  const [drawerCandidate, setDrawerCandidate] = useState<StrategyCandidate | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const snap = historyOverride ?? liveSnap;
  const runFull = useCallback(() => runScan(), [runScan]);
  const timing = metrics ?? summary?.timing ?? null;

  const scanLabel = useMemo(() => {
    const u = snap.universe;
    if (u.length === 1) return u[0]!;
    return `${u.length} symbols`;
  }, [snap.universe]);

  const [openEval, setOpenEval] = useState<Record<string, boolean>>({});

  const recordedAt = useRef<string | null>(null);
  useEffect(() => {
    setHistoryEntries(loadScanHistory());
  }, []);

  useEffect(() => {
    if (!lastCompletedAt || !lastSnapshot) return;
    if (recordedAt.current === lastCompletedAt) return;
    recordedAt.current = lastCompletedAt;
    const dur = summary?.timing?.wallClockMs ?? metrics?.wallClockMs ?? 0;
    const next = appendScanHistoryEntry({ snapshot: lastSnapshot, durationMs: dur });
    setHistoryEntries(next);
  }, [lastCompletedAt, lastSnapshot, summary?.timing?.wallClockMs, metrics?.wallClockMs]);

  const providerHealth = useMemo(
    () => providerHealthFromScan(snap, timing, snap.decisions),
    [snap, timing],
  );

  const openDrawer = useCallback((c: StrategyCandidate) => {
    setDrawerCandidate(c);
    setDrawerOpen(true);
  }, []);

  const copyIdea = useCallback(
    (c: StrategyCandidate) => {
      void navigator.clipboard.writeText(buildCopyTradeIdeaText(c, snap));
    },
    [snap],
  );

  const onSelectHistory = useCallback((e: ScanHistoryEntry) => {
    const parsed = parseHistorySnapshot(e.snapshotJson);
    if (parsed) {
      setHistoryOverride(parsed);
      setActiveHistoryId(e.id);
    }
  }, []);

  const exitHistory = useCallback(() => {
    setHistoryOverride(null);
    setActiveHistoryId(null);
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Market scanner</h1>
        <p className="text-sm text-[var(--muted)]">
          Mode <strong className="text-foreground">{snap.mode}</strong> · book $
          {snap.portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </p>
        <div className="mt-3">
          <ProviderStackPanel stack={snap.dataSources} />
        </div>
        {debugOn && initialSnapshot.quoteDiagnostics && (
          <p className="mt-2 text-xs text-amber-200/90">
            Quote debug on — pipeline for first {initialSnapshot.quoteDiagnostics.length} symbol(s).
          </p>
        )}
      </div>

      <LiveDeskToolbar desk={desk} scanLabel={scanLabel} onRunScan={runFull} />

      {historyOverride && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <span>Viewing a saved scan from history (local browser).</span>
          <button
            type="button"
            onClick={exitHistory}
            className="rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-foreground hover:bg-white/15"
          >
            Back to live
          </button>
        </div>
      )}

      <ProviderHealthStrip items={providerHealth} />

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
          scanMeta={snap.scanMeta}
          lastCompletedAt={lastCompletedAt}
          initialLoadNote={
            !lastCompletedAt ? "Initial data from server render (not a live stream run)." : undefined
          }
          className={
            pulseScanDone
              ? "ring-2 ring-cyan-500/35 shadow-[0_0_22px_-8px_rgba(34,211,238,0.4)]"
              : ""
          }
        />
        <ScanMetricsCard metrics={timing} />
      </div>

      <TodaysBestIdeaCard
        top={snap.candidates[0]}
        snap={snap}
        pulse={pulseHighlight}
        onOpenRationale={() => {
          const t = snap.candidates[0];
          if (t) openDrawer(t);
        }}
        onCopy={() => {
          const t = snap.candidates[0];
          if (t) copyIdea(t);
        }}
      />

      <ScanHistoryPanel
        entries={historyEntries}
        activeId={activeHistoryId}
        onSelect={onSelectHistory}
      />

      {debugOn && initialSnapshot.quoteDiagnostics && initialSnapshot.quoteDiagnostics.length > 0 && (
        <ScannerQuoteDebugPanel rows={initialSnapshot.quoteDiagnostics} />
      )}

      <div className="card overflow-hidden">
        <div className="border-b border-[var(--border)] bg-black/20 px-3 py-2 text-xs text-[var(--muted)]">
          <p>Ranked by composite score. Up to 8 names. Expand a row for AI rationale and OpenAI output.</p>
          <p className="mt-1 text-[10px] text-cyan-200/80">
            Confidence bands: 8.5+ very high · 7.0–8.4 strong · 6.0–6.9 watchlist only · below 6 no
            alert tier
          </p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-black/20 text-xs text-[var(--muted)]">
            <tr>
              <th className="p-3">Symbol</th>
              <th className="p-3">Passed gates</th>
              <th className="p-3">Progress</th>
              <th className="p-3">NBBO</th>
              <th className="p-3">Asset</th>
              <th className="p-3">View</th>
              <th className="p-3">Rank</th>
              <th className="p-3">Conf</th>
              <th className="p-3">Risk</th>
              <th className="p-3">Hold</th>
              <th className="p-3">Catalyst</th>
              <th className="p-3">Ern</th>
              <th className="p-3">Tag</th>
              <th className="p-3">Sources</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {snap.candidates.map((c) => {
              const p = c.facts.provenance as Record<string, string | null> | undefined;
              const badge = scannerNbboBadgeFromFacts(c.facts as Record<string, unknown>);
              const hi = isProminentConviction(
                c.confidence,
                snap.minTradeAlertConfidence,
                snap.alertsHighConvictionOnly,
              );
              const rowKey = c.symbol + c.assetType;
              const showOpenai =
                p?.reasoning === "OPENAI" || Boolean(c.inferences?.openaiStructuredOutput);
              const alertTip = whyNotAlertedLines(
                c,
                snap.minTradeAlertConfidence,
                snap.alertsHighConvictionOnly,
              ).join(" · ");
              const gateChips = passedGateChips(c, snap.mode);
              return (
                <Fragment key={rowKey}>
                  <tr
                    className={`border-b border-[var(--border)] ${
                      hi
                        ? "bg-amber-500/10 ring-1 ring-amber-500/30 ring-inset"
                        : ""
                    }`}
                  >
                    <td className="p-3 align-top">
                      <span
                        className="cursor-help font-mono underline decoration-dotted decoration-[var(--muted)] underline-offset-2"
                        title={provenanceTooltipFromCandidate(c)}
                      >
                        {c.symbol}
                      </span>
                      {hi && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className="rounded bg-amber-500/25 px-1 py-0.5 text-[9px] font-medium uppercase text-amber-100">
                            High conviction
                          </span>
                          <span className="rounded border border-amber-400/40 px-1 py-0.5 text-[9px] text-amber-100/90">
                            Alert candidate
                          </span>
                          <span className="rounded border border-[var(--border)] px-1 py-0.5 text-[9px] text-[var(--muted)]">
                            Simulated trade: worker
                          </span>
                        </div>
                      )}
                      {showOpenai && (
                        <span className="mt-1 inline-block rounded bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-medium text-violet-100">
                          AI used
                        </span>
                      )}
                      <span
                        className="mt-1 ml-1 inline-block cursor-help rounded border border-[var(--border)] px-1 text-[9px] text-[var(--muted)]"
                        title={alertTip}
                      >
                        Why not alerted?
                      </span>
                    </td>
                    <td className="p-3 align-top">
                      <GateChipsRow chips={gateChips} />
                    </td>
                    <td className="p-3 align-top text-[10px] text-[var(--muted)]">
                      {symbolProgress[c.symbol] ? (
                        <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-cyan-200/90">
                          {symbolDeskPhaseLabel(symbolProgress[c.symbol])}
                        </span>
                      ) : (
                        <span className="font-mono">—</span>
                      )}
                    </td>
                    <td className="p-3 align-top">
                      <span className={badge.className}>{badge.label}</span>
                    </td>
                    <td className="p-3">{c.assetType}</td>
                    <td className="p-3 text-[10px] text-[var(--muted)]">
                      {c.strategyViewTag.replace(/_/g, " ")}
                    </td>
                    <td className="p-3 font-mono text-xs">{c.rankScore.toFixed(1)}</td>
                    <td className="p-3">
                      <ConfidenceBadge value={c.confidence} />
                    </td>
                    <td className="p-3">{c.riskScore.toFixed(1)}</td>
                    <td className="max-w-[140px] p-3 text-[10px] text-[var(--muted)]">
                      {c.holdingPeriodNote}
                    </td>
                    <td className="max-w-[160px] p-3 text-[10px] text-[var(--muted)]">
                      {c.catalystSummary}
                    </td>
                    <td className="p-3">{c.isEarningsPlay ? "yes" : "no"}</td>
                    <td className="p-3 text-xs text-[var(--muted)]">{c.strategyTag}</td>
                    <td className="p-3 align-top text-[10px] leading-tight text-[var(--muted)]">
                      <div>q: {p?.quotes ?? "—"}</div>
                      <div>c: {p?.candles ?? "—"}</div>
                      <div>e: {p?.earningsCalendar ?? "—"}</div>
                      <div>n: {p?.news ?? "—"}</div>
                      <div>o: {p?.optionsChain ?? "—"}</div>
                      <div>web: {p?.webResearch ?? "—"}</div>
                      <div>AI: {p?.reasoning ?? "—"}</div>
                    </td>
                    <td className="p-3 align-top">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => openDrawer(c)}
                          className="whitespace-nowrap rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-medium text-cyan-100 hover:bg-cyan-500/20"
                        >
                          Decision card
                        </button>
                        <button
                          type="button"
                          onClick={() => copyIdea(c)}
                          className="whitespace-nowrap rounded border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--muted)] hover:bg-white/5"
                        >
                          Copy idea
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr className="border-b border-[var(--border)] bg-black/25">
                    <td colSpan={15} className="p-0">
                      <details
                        className="group"
                        open={openEval[rowKey]}
                        onToggle={(e) =>
                          setOpenEval((s) => ({
                            ...s,
                            [rowKey]: (e.target as HTMLDetailsElement).open,
                          }))
                        }
                      >
                        <summary className="cursor-pointer px-3 py-2 text-xs text-cyan-200/90 hover:bg-white/5">
                          AI rationale preview · thesis · risk · OpenAI JSON
                        </summary>
                        <div className="space-y-3 px-3 pb-3 text-xs">
                          <div>
                            <p className="text-[var(--muted)]">Thesis</p>
                            <p className="text-foreground">{c.thesis}</p>
                          </div>
                          <div>
                            <p className="text-[var(--muted)]">Invalidation</p>
                            <p className="text-foreground">{c.invalidation}</p>
                          </div>
                          <OpenAiStructuredBlock c={c} />
                        </div>
                      </details>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {snap.candidates.length === 0 && (
          <p className="p-6 text-sm text-[var(--muted)]">
            No TRADE candidates this run. Run a live scan or check engine decisions below.
          </p>
        )}
      </div>

      {(snap.stockCandidates.length > 0 || snap.optionCandidates.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="card p-3 text-xs">
            <h3 className="text-sm font-medium text-foreground">Stock candidates</h3>
            <ul className="mt-2 space-y-1 text-[var(--muted)]">
              {snap.stockCandidates.map((c) => (
                <li key={`s-${c.symbol}`} className="flex justify-between gap-2">
                  <span className="font-mono text-foreground">{c.symbol}</span>
                  <span>
                    r {c.rankScore.toFixed(1)} · {c.strategyViewTag.replace(/_/g, " ")}
                  </span>
                </li>
              ))}
              {snap.stockCandidates.length === 0 && (
                <li className="text-[var(--muted)]">None this scan.</li>
              )}
            </ul>
          </div>
          <div className="card p-3 text-xs">
            <h3 className="text-sm font-medium text-foreground">Option candidates</h3>
            <ul className="mt-2 space-y-1 text-[var(--muted)]">
              {snap.optionCandidates.map((c) => (
                <li key={`o-${c.symbol}`} className="flex justify-between gap-2">
                  <span className="font-mono text-foreground">{c.symbol}</span>
                  <span>
                    r {c.rankScore.toFixed(1)} · {c.strategyViewTag.replace(/_/g, " ")}
                  </span>
                </li>
              ))}
              {snap.optionCandidates.length === 0 && (
                <li className="text-[var(--muted)]">None this scan.</li>
              )}
            </ul>
          </div>
        </div>
      )}
      <ScannerReasonLegend />

      <div className="card overflow-hidden">
        <h2 className="border-b border-[var(--border)] bg-black/20 px-3 py-2 text-sm font-medium">
          Engine decisions (TRADE / NO_TRADE)
        </h2>
        <p className="border-b border-[var(--border)] px-3 py-2 text-[10px] text-[var(--muted)]">
          Expand a row for model output snippets. <span className="text-violet-200/90">AI used</span>{" "}
          only when OpenAI was called.
        </p>
        <div className="max-h-80 overflow-auto text-xs">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-[#070b12] text-[var(--muted)]">
              <tr>
                <th className="p-2">Ticker</th>
                <th className="p-2">Progress</th>
                <th className="p-2">Rejected by</th>
                <th className="p-2">Decision</th>
                <th className="p-2">Reason</th>
                <th className="p-2">AI</th>
                <th className="p-2">Used</th>
                <th className="p-2">Missing</th>
              </tr>
            </thead>
            <tbody>
              {snap.decisions.map((d, i) => (
                <DecisionTableRows key={i} d={d} phase={symbolProgress[d.ticker]} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <details className="card p-4 text-xs text-[var(--muted)]">
        <summary className="cursor-pointer text-foreground">Sample thesis / facts</summary>
        <div className="mt-3 space-y-3">
          {snap.candidates.slice(0, 3).map((c) => (
            <div key={c.symbol}>
              <p className="text-foreground">{c.symbol}</p>
              <p>Thesis (inference): {c.thesis}</p>
              <pre className="mt-1 max-h-32 overflow-auto rounded bg-black/30 p-2 text-[10px]">
                {JSON.stringify({ facts: c.facts, invalidation: c.invalidation }, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </details>

      <DecisionDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerCandidate(null);
        }}
        candidate={drawerCandidate}
        snap={snap}
      />
    </div>
  );
}

function DecisionTableRows({
  d,
  phase,
}: {
  d: StrictDecisionRecord;
  phase?: SymbolDeskPhase;
}) {
  const optReason =
    d.reasonCode != null && OPTION_SPECIFIC_REASON_CODES.has(d.reasonCode);
  const aiUsed = d.sourcesUsed.reasoningLayer === "OPENAI";
  const noTrade =
    (d.provenance.openaiNoTradeReason as string | null | undefined) ?? null;
  const err = d.sourcesUsed.openaiError ?? null;
  const rejected = rejectedByChips(d);

  return (
    <Fragment>
      <tr className="border-b border-[var(--border)]/60">
        <td className="p-2 align-top">
          <span
            className="cursor-help font-mono underline decoration-dotted decoration-[var(--muted)] underline-offset-2"
            title={provenanceTooltipFromDecision(d)}
          >
            {d.ticker}
          </span>
        </td>
        <td className="p-2 align-top text-[10px] text-[var(--muted)]">
          {phase ? (
            <span className="rounded bg-black/30 px-1 font-mono text-cyan-200/90">
              {symbolDeskPhaseLabel(phase)}
            </span>
          ) : (
            "—"
          )}
        </td>
        <td className="p-2 align-top" title={rejected.title}>
          <RejectedChipsRow labels={rejected.labels} />
        </td>
        <td className="p-2 align-top">{d.decision}</td>
        <td className="p-2 align-top text-[var(--muted)]">
          <span title={optReason ? "Option-specific gate" : undefined}>{d.reasonCode ?? "—"}</span>
        </td>
        <td className="p-2 align-top">
          {aiUsed ? (
            <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-medium text-violet-100">
              AI used
            </span>
          ) : (
            <span className="text-[var(--muted)]">—</span>
          )}
        </td>
        <td className="p-2 align-top text-[10px] text-[var(--muted)]">
          {JSON.stringify(d.sourcesUsed)}
        </td>
        <td className="p-2 align-top text-[10px] text-amber-200/80">
          {d.sourcesMissing.length ? d.sourcesMissing.join(", ") : "—"}
        </td>
      </tr>
      <tr className="border-b border-[var(--border)]/60 bg-black/20">
        <td colSpan={8} className="p-0">
          <details className="group">
            <summary className="cursor-pointer px-2 py-1.5 text-[10px] text-cyan-200/90">
              Rationale preview · no-trade reason · OpenAI error
            </summary>
            <div className="space-y-2 px-2 pb-2 text-[10px] text-[var(--muted)]">
              {noTrade && (
                <p>
                  <span className="text-foreground">No-trade (model): </span>
                  {noTrade}
                </p>
              )}
              {err && (
                <p className="text-rose-200/90">
                  <span className="text-foreground">OpenAI error: </span>
                  {err}
                </p>
              )}
              {!noTrade && !err && (
                <p>Nothing extra recorded for this decision path.</p>
              )}
            </div>
          </details>
        </td>
      </tr>
    </Fragment>
  );
}
