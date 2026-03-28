"use client";

import { confidenceBand } from "@/lib/scanner/confidence-bands";

export function ConfidenceBadge({ value }: { value: number }) {
  const b = confidenceBand(value);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${b.className}`}
      title={b.label}
    >
      <span className="font-mono">{value.toFixed(1)}</span>
      <span className="opacity-80">{b.shortLabel}</span>
    </span>
  );
}
