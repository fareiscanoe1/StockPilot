"use client";

export function RejectedChipsRow({ labels }: { labels: string[] }) {
  if (!labels.length) return <span className="text-[var(--muted)]">—</span>;
  return (
    <div className="flex max-w-[220px] flex-wrap gap-0.5">
      {labels.map((l) => (
        <span
          key={l}
          className="rounded border border-rose-500/35 bg-rose-500/10 px-1 py-0.5 text-[8px] font-semibold uppercase leading-none text-rose-100/95"
        >
          {l}
        </span>
      ))}
    </div>
  );
}
