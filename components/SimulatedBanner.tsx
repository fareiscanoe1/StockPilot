export function SimulatedBanner() {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
      <span className="pill-sim">Simulated only</span>
      <span>
        The AI trades a virtual portfolio. Your real brokerage account stays
        external — copy trades manually if you choose.
      </span>
    </div>
  );
}
