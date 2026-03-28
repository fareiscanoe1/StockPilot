/** Fixed desk bands (alert policy is separate from notification prefs). */
export function confidenceBand(confidence: number): {
  label: string;
  shortLabel: string;
  className: string;
} {
  if (confidence >= 8.5) {
    return {
      label: "Very high",
      shortLabel: "VH",
      className: "bg-emerald-500/25 text-emerald-100 border-emerald-400/40",
    };
  }
  if (confidence >= 7) {
    return {
      label: "Strong",
      shortLabel: "S",
      className: "bg-cyan-500/20 text-cyan-100 border-cyan-400/35",
    };
  }
  if (confidence >= 6) {
    return {
      label: "Watchlist only",
      shortLabel: "W",
      className: "bg-amber-500/20 text-amber-100 border-amber-400/35",
    };
  }
  return {
    label: "No alert band",
    shortLabel: "—",
    className: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  };
}
