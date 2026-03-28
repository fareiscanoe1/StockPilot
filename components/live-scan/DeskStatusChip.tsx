"use client";

import type { DeskStatusChipState } from "./useLiveDesk";

const LABEL: Record<DeskStatusChipState, string> = {
  idle: "Idle",
  scanning: "Scanning",
  waiting_next: "Waiting for next scan",
  error: "Error",
  openai_evaluating: "OpenAI evaluating",
};

const STYLE: Record<DeskStatusChipState, string> = {
  idle: "border-[var(--border)] bg-black/25 text-[var(--muted)]",
  scanning: "border-cyan-500/50 bg-cyan-500/15 text-cyan-100 animate-pulse",
  waiting_next: "border-amber-500/40 bg-amber-500/10 text-amber-100",
  error: "border-rose-500/50 bg-rose-500/15 text-rose-100",
  openai_evaluating:
    "border-violet-500/50 bg-violet-500/15 text-violet-100 animate-pulse",
};

export function DeskStatusChip({
  status,
  openAiSymbol,
}: {
  status: DeskStatusChipState;
  openAiSymbol: string | null;
}) {
  return (
    <div
      className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${STYLE[status]}`}
      title="Desk status"
    >
      <span className="font-mono uppercase tracking-wide">{LABEL[status]}</span>
      {status === "openai_evaluating" && openAiSymbol && (
        <span className="text-[10px] opacity-90">{openAiSymbol}</span>
      )}
    </div>
  );
}
