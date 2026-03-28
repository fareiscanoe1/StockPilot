"use client";

export function LiveScanControls({
  scanning,
  onRunScan,
  scanLabel,
  mode,
  onModeChange,
  intervalMin,
  onIntervalMinChange,
  countdown,
  onReplay,
  soundsOn,
  onSoundsToggle,
}: {
  scanning: boolean;
  onRunScan: () => void;
  scanLabel?: string | null;
  mode: "manual" | "auto";
  onModeChange: (m: "manual" | "auto") => void;
  intervalMin: number;
  onIntervalMinChange: (n: number) => void;
  countdown: number;
  onReplay?: () => void;
  soundsOn?: boolean;
  onSoundsToggle?: () => void;
}) {
  const mm = Math.floor(countdown / 60);
  const ss = countdown % 60;

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-black/20 px-3 py-2 text-xs">
      <button
        type="button"
        disabled={scanning}
        onClick={onRunScan}
        className="rounded-md bg-cyan-600 px-3 py-1.5 font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
      >
        {scanning ? "Scanning…" : "Run AI scan now"}
      </button>

      {onReplay && (
        <button
          type="button"
          disabled={scanning}
          onClick={onReplay}
          className="rounded-md border border-[var(--border)] px-2 py-1.5 text-[var(--muted)] hover:bg-white/5 disabled:opacity-50"
          title="Replay last scan event stream (session)"
        >
          Replay stream
        </button>
      )}

      {onSoundsToggle && (
        <button
          type="button"
          onClick={onSoundsToggle}
          className={`rounded-md px-2 py-1.5 ${
            soundsOn ? "bg-white/10 text-foreground" : "text-[var(--muted)]"
          }`}
          title="Desk notification sounds"
        >
          Sound {soundsOn ? "on" : "off"}
        </button>
      )}

      <div className="flex items-center gap-2 border-l border-[var(--border)] pl-3">
        <span className="text-[var(--muted)]">Watch</span>
        <button
          type="button"
          onClick={() => onModeChange("manual")}
          className={`rounded px-2 py-1 ${mode === "manual" ? "bg-white/10 text-foreground" : "text-[var(--muted)]"}`}
        >
          Manual
        </button>
        <button
          type="button"
          onClick={() => onModeChange("auto")}
          className={`rounded px-2 py-1 ${mode === "auto" ? "bg-white/10 text-foreground" : "text-[var(--muted)]"}`}
        >
          Auto
        </button>
        <label className="flex items-center gap-1 text-[var(--muted)]">
          every
          <select
            className="rounded border border-[var(--border)] bg-[#0a0f18] px-1 py-0.5 text-foreground"
            value={intervalMin}
            disabled={mode !== "auto"}
            onChange={(e) => onIntervalMinChange(Number(e.target.value))}
          >
            {[2, 5, 10, 15, 30].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>
        {mode === "auto" && !scanning && (
          <span className="font-mono text-cyan-200/90">
            Next: {mm}:{ss.toString().padStart(2, "0")}
          </span>
        )}
      </div>

      {scanLabel && (
        <span className="w-full text-[11px] text-amber-200/90 sm:ml-auto sm:w-auto">
          Currently scanning: <strong className="font-mono text-foreground">{scanLabel}</strong>
        </span>
      )}
    </div>
  );
}
