"use client";

import type { ScannerSnapshot } from "@/lib/queries/scanner-snapshot";
import type { StrategyCandidate } from "@/lib/engines/strategy-engine";
import { wouldMeetAlertThreshold, whyNotAlertedLines } from "@/lib/scan/alert-eligibility";
import { buildCopyTradeIdeaText } from "@/lib/scanner/copy-trade-idea";
import { passedGateChips } from "@/lib/scanner/gates-display";
import { GateChipsRow } from "./GateChipsRow";
import { ConfidenceBadge } from "./ConfidenceBadge";

export function DecisionDrawer({
  open,
  onClose,
  candidate,
  snap,
}: {
  open: boolean;
  onClose: () => void;
  candidate: StrategyCandidate | null;
  snap: ScannerSnapshot;
}) {
  if (!open || !candidate) return null;

  const meets = wouldMeetAlertThreshold(
    candidate.confidence,
    snap.minTradeAlertConfidence,
    snap.alertsHighConvictionOnly,
  );
  const alertNotes = whyNotAlertedLines(
    candidate,
    snap.minTradeAlertConfidence,
    snap.alertsHighConvictionOnly,
  );
  const gates = passedGateChips(candidate, snap.mode);
  const p = candidate.facts.provenance as Record<string, string | null> | undefined;

  const copyText = () => {
    void navigator.clipboard.writeText(buildCopyTradeIdeaText(candidate, snap));
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[var(--border)] bg-[#070b14] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="decision-drawer-title"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 id="decision-drawer-title" className="text-lg font-semibold text-foreground">
            Decision card
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--muted)] hover:bg-white/10 hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xl text-foreground">{candidate.symbol}</span>
            <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-100">
              TRADE
            </span>
            <ConfidenceBadge value={candidate.confidence} />
            <span className="text-[var(--muted)]">Risk {candidate.riskScore.toFixed(1)}</span>
          </div>

          <p className="mt-2 text-xs text-[var(--muted)]">
            {candidate.strategyTag.replace(/_/g, " ")} · {candidate.strategyViewTag.replace(/_/g, " ")} ·{" "}
            {candidate.assetType}
          </p>

          <div className="mt-3">
            <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Passed gates</p>
            <div className="mt-1">
              <GateChipsRow chips={gates} />
            </div>
          </div>

          <div className="mt-4">
            <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Catalyst</p>
            <p className="mt-1 text-foreground">{candidate.catalystSummary || "—"}</p>
          </div>

          <div className="mt-4">
            <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Hold period</p>
            <p className="mt-1 text-[var(--muted)]">{candidate.holdingPeriodNote || "—"}</p>
          </div>

          <div className="mt-4">
            <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Invalidation</p>
            <p className="mt-1 text-foreground">{candidate.invalidation}</p>
          </div>

          <div className="mt-4">
            <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Why this passed</p>
            <p className="mt-1 text-foreground">{candidate.thesis}</p>
          </div>

          <div className="mt-4">
            <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Why this could fail</p>
            <p className="mt-1 text-[var(--muted)]">
              Model invalidation: {candidate.invalidation}
            </p>
            <p className="mt-2 text-[11px] text-amber-200/85">
              Real markets gap, slippage, and headline risk are not fully captured in this snapshot.
            </p>
          </div>

          <div className="mt-4">
            <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Sources used</p>
            <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-[var(--muted)]">
              <li>Quotes: {p?.quotes ?? "—"}</li>
              <li>Candles: {p?.candles ?? "—"}</li>
              <li>Earnings: {p?.earningsCalendar ?? "—"}</li>
              <li>News: {p?.news ?? "—"}</li>
              <li>Options: {p?.optionsChain ?? "—"}</li>
              <li>Web: {p?.webResearch ?? "—"}</li>
              <li>AI: {p?.reasoning ?? "—"}</li>
            </ul>
          </div>

          <div className="mt-4 rounded-lg border border-[var(--border)] bg-black/30 p-3">
            <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Alert threshold</p>
            <p className="mt-1 text-sm text-foreground">
              {meets ? "Met — would be eligible for worker review on cron." : "Not met for your prefs."}
            </p>
            <ul className="mt-2 list-inside list-disc text-[10px] text-[var(--muted)]">
              {alertNotes.slice(0, 6).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-[var(--border)] p-3">
          <button
            type="button"
            onClick={copyText}
            className="w-full rounded-md bg-cyan-600 py-2 text-sm font-medium text-white hover:bg-cyan-500"
          >
            Copy trade idea
          </button>
        </div>
      </aside>
    </>
  );
}
