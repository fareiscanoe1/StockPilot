"use client";

import type { ScanHistoryEntry } from "@/lib/scanner/scan-history-storage";

function fmtDur(ms: number) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function ScanHistoryPanel({
  entries,
  onSelect,
  activeId,
}: {
  entries: ScanHistoryEntry[];
  onSelect: (e: ScanHistoryEntry) => void;
  activeId: string | null;
}) {
  if (!entries.length) {
    return (
      <div className="card p-3 text-xs text-[var(--muted)]">
        Scan history fills after each completed live run (stored in this browser).
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <h2 className="border-b border-[var(--border)] bg-black/20 px-3 py-2 text-sm font-medium">
        Scan history
      </h2>
      <div className="max-h-64 overflow-y-auto text-xs">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-[#070b12] text-[10px] text-[var(--muted)]">
            <tr>
              <th className="p-2">Time</th>
              <th className="p-2">Syms</th>
              <th className="p-2">OA</th>
              <th className="p-2">TRADE</th>
              <th className="p-2">Top</th>
              <th className="p-2">Dur</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr
                key={e.id}
                className={`cursor-pointer border-b border-[var(--border)]/60 hover:bg-white/5 ${
                  activeId === e.id ? "bg-cyan-500/10" : ""
                }`}
                onClick={() => onSelect(e)}
              >
                <td className="p-2 font-mono text-[10px] text-foreground">
                  {new Date(e.finishedAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="p-2 font-mono">{e.symbolsChecked}</td>
                <td className="p-2 font-mono">{e.openAiCalls}</td>
                <td className="p-2 font-mono">{e.tradeDecisions}</td>
                <td className="p-2 font-mono text-[10px]">{e.topSymbol ?? "—"}</td>
                <td className="p-2 font-mono text-[10px] text-[var(--muted)]">
                  {fmtDur(e.durationMs)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-[var(--border)] px-3 py-2 text-[10px] text-[var(--muted)]">
        Click a row to reopen that snapshot in this view (local only).
      </p>
    </div>
  );
}
