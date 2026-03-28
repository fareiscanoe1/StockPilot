"use client";

import { AI_ACTIVITY_STEPS, stepStatusLabel, type StepStatus } from "./step-meta";

export function AiActivityPanel({
  steps,
  scanning,
}: {
  steps: Record<string, StepStatus>;
  scanning: boolean;
}) {
  return (
    <div className="card overflow-hidden p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">AI activity</h2>
        {scanning && (
          <span className="animate-pulse text-xs text-cyan-200/90">Scan in progress…</span>
        )}
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {AI_ACTIVITY_STEPS.map(({ id, label }) => {
          const st = steps[id] ?? "idle";
          const active = st === "running" || (scanning && st === "idle");
          return (
            <li
              key={id}
              className={`flex items-center justify-between rounded-md border px-2 py-1.5 text-xs ${
                st === "failed"
                  ? "border-rose-500/40 bg-rose-500/10"
                  : st === "done"
                    ? "border-emerald-500/35 bg-emerald-500/10"
                    : st === "skipped"
                      ? "border-[var(--border)] bg-black/20 text-[var(--muted)]"
                      : active
                        ? "border-cyan-500/40 bg-cyan-500/10"
                        : "border-[var(--border)] bg-black/15"
              }`}
            >
              <span className="pr-2 text-[var(--muted)]">{label}</span>
              <span
                className={`shrink-0 font-mono text-[10px] uppercase ${
                  st === "failed"
                    ? "text-rose-200"
                    : st === "done"
                      ? "text-emerald-200"
                      : st === "skipped"
                        ? "text-[var(--muted)]"
                        : active
                          ? "text-cyan-200"
                          : "text-[var(--muted)]"
                }`}
              >
                {stepStatusLabel(st)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
