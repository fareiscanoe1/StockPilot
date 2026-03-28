"use client";

import type { ProviderHealthItem, ProviderHealthStatus } from "@/lib/scanner/provider-health";

function dot(st: ProviderHealthStatus) {
  if (st === "ok") return "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]";
  if (st === "slow") return "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.45)]";
  return "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.45)]";
}

export function ProviderHealthStrip({ items }: { items: ProviderHealthItem[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-black/25 px-3 py-2 text-[11px]">
      <span className="font-medium text-[var(--muted)]">Providers</span>
      {items.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-1.5"
          title={p.detail}
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot(p.status)}`} />
          <span className="text-foreground">{p.label}</span>
          <span className="text-[var(--muted)]">
            {p.status === "ok" ? "OK" : p.status === "slow" ? "Slow" : "Failed"}
          </span>
        </div>
      ))}
    </div>
  );
}
