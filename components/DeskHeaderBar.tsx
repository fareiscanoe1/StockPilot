/** Single-line app chrome: paper scope + live feeds, no duplicate badges. */
export function DeskHeaderBar() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
      <span className="text-foreground/90">Paper trading</span>
      <span className="hidden text-[var(--border)] sm:inline" aria-hidden>
        ·
      </span>
      <span>Live vendor feeds</span>
      <span className="hidden text-[var(--border)] sm:inline" aria-hidden>
        ·
      </span>
      <span>Does not route orders to a broker</span>
    </div>
  );
}
