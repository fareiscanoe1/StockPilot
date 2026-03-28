"use client";

import type { LiveScanSummary } from "@/lib/scan/types";
import type { UniverseScanMeta } from "@/lib/engines/strategy-engine";

export function LastRunSummaryCard({
  summary,
  scanMeta,
  lastCompletedAt,
  initialLoadNote,
  className = "",
}: {
  summary: LiveScanSummary | null;
  scanMeta?: UniverseScanMeta | null;
  lastCompletedAt: string | null;
  initialLoadNote?: string;
  className?: string;
}) {
  const s = summary;
  const meta = s
    ? {
        symbolsChecked: s.symbolsChecked,
        passedToOpenAi: s.passedToOpenAi,
        openAiCalls: s.openAiCalls,
        stockCandidates: s.stockCandidates,
        optionCandidates: s.optionCandidates,
        tradeDecisions: s.tradeDecisions,
        note: s.tradeAlertsSentNote,
      }
    : scanMeta
      ? {
          symbolsChecked: scanMeta.symbolsChecked,
          passedToOpenAi: scanMeta.passedToOpenAiGate,
          openAiCalls: scanMeta.openAiInvocations,
          stockCandidates: scanMeta.stockCandidateCount,
          optionCandidates: scanMeta.optionCandidateCount,
          tradeDecisions: scanMeta.tradeDecisionCount,
          note: initialLoadNote,
        }
      : null;

  if (!meta) {
    return (
      <div className={`card p-3 text-xs text-[var(--muted)] ${className}`}>
        Last run summary will appear after your first live scan.
      </div>
    );
  }

  return (
    <div className={`card p-3 transition-shadow duration-500 ${className}`}>
      <h2 className="text-sm font-medium text-foreground">Last run summary</h2>
      <p className="mt-1 text-[10px] text-[var(--muted)]">
        {lastCompletedAt
          ? `Finished ${new Date(lastCompletedAt).toLocaleString()}`
          : initialLoadNote ?? "Initial page data (server)"}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-[var(--muted)]">Symbols checked</dt>
          <dd className="font-mono text-foreground">{meta.symbolsChecked}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Passed to OpenAI gate</dt>
          <dd className="font-mono text-foreground">{meta.passedToOpenAi}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">OpenAI calls</dt>
          <dd className="font-mono text-foreground">{meta.openAiCalls}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Stock candidates</dt>
          <dd className="font-mono text-foreground">{meta.stockCandidates}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Option candidates</dt>
          <dd className="font-mono text-foreground">{meta.optionCandidates}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">TRADE decisions</dt>
          <dd className="font-mono text-foreground">{meta.tradeDecisions}</dd>
        </div>
      </dl>
      {meta.note && (
        <p className="mt-3 border-t border-[var(--border)] pt-2 text-[10px] text-[var(--muted)]">
          {meta.note}
        </p>
      )}
    </div>
  );
}
