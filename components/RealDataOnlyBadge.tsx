export function RealDataOnlyBadge() {
  return (
    <div
      className="shrink-0 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-emerald-200"
      title="No mock or synthetic market data — trades require live vendor feeds."
    >
      Real data only
    </div>
  );
}
