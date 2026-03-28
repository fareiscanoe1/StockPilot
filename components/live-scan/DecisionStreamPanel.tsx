"use client";

import { useEffect, useRef } from "react";

export function DecisionStreamPanel({
  lines,
}: {
  lines: { id: string; text: string; level?: string }[];
}) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  return (
    <div className="card flex max-h-48 flex-col overflow-hidden p-3">
      <h2 className="mb-2 text-sm font-medium text-foreground">Decision stream</h2>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-md bg-black/40 p-2 font-mono text-[11px] leading-relaxed">
        {lines.length === 0 ? (
          <p className="text-[var(--muted)]">Run a scan to stream engine decisions here.</p>
        ) : (
          lines.map((l) => (
            <div
              key={l.id}
              className={
                l.level === "error"
                  ? "text-rose-200/95"
                  : l.level === "warn"
                    ? "text-amber-200/90"
                    : l.level === "ok"
                      ? "text-emerald-200/90"
                      : "text-slate-200/90"
              }
            >
              {l.text}
            </div>
          ))
        )}
        <div ref={bottom} />
      </div>
    </div>
  );
}
