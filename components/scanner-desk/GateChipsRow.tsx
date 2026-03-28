"use client";

import type { GateChip } from "@/lib/scanner/gates-display";

function chipClass(state: GateChip["state"]): string {
  if (state === "pass") return "border-emerald-500/40 bg-emerald-500/15 text-emerald-100";
  if (state === "fail") return "border-rose-500/40 bg-rose-500/15 text-rose-100";
  return "border-[var(--border)] bg-black/25 text-[var(--muted)]";
}

export function GateChipsRow({ chips }: { chips: GateChip[] }) {
  return (
    <div className="flex max-w-[200px] flex-wrap gap-0.5">
      {chips.map((c) => (
        <span
          key={c.id}
          title={c.title}
          className={`rounded border px-1 py-0.5 text-[8px] font-semibold uppercase leading-none ${chipClass(c.state)}`}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}
