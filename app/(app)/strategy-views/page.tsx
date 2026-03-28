import { auth } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

const views = [
  {
    id: "earnings_breakout",
    title: "Earnings breakout",
    mode: "EARNINGS_HUNTER",
    blurb:
      "Names with earnings inside a tight calendar window, higher liquidity bar, and event-driven AI context. Best when you want pre-event positioning with strict proximity rules.",
  },
  {
    id: "post_earnings_continuation",
    title: "Post-earnings continuation",
    mode: "BALANCED",
    blurb:
      "Use balanced / swing mode after the print: combine trend confirmation, volume, and headlines. Tune risk params toward wider stops until volatility compresses.",
  },
  {
    id: "momentum_swing",
    title: "Momentum swing",
    mode: "BALANCED",
    blurb:
      "Default multi-factor path: trend score, fundamentals snapshot, news, and structured AI output. Good for 1–6 week holds when liquidity and min-price gates pass.",
  },
  {
    id: "momentum_swing_aggressive",
    title: "Momentum swing (aggressive)",
    mode: "AGGRESSIVE",
    blurb:
      "Looser spread and volume floors with larger sleeve sizes — still real-data-only and gated by the same NBBO / options liquidity machinery.",
  },
  {
    id: "options_momentum",
    title: "Options momentum",
    mode: "OPTIONS_MOMENTUM",
    blurb:
      "Polygon chain with min OI, contract volume, DTE window, and spread caps. Illiquid strikes are dropped before the model sees the book.",
  },
  {
    id: "defensive_setup",
    title: "Defensive setups",
    mode: "DEFENSIVE",
    blurb:
      "Tighter spreads, higher min volume, larger min price, and conservative trend threshold — fewer names, higher quality bar.",
  },
] as const;

export default async function StrategyViewsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Strategy views</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Desk playbooks mapped to core <code className="text-foreground">StrategyMode</code> presets.
          Apply the mode under{" "}
          <Link href="/strategy" className="text-[var(--accent)] hover:underline">
            Strategy settings
          </Link>
          .
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {views.map((v) => (
          <div key={v.id} className="card p-4 text-sm">
            <h2 className="font-medium text-foreground">{v.title}</h2>
            <p className="mt-1 text-xs uppercase tracking-wide text-[var(--muted)]">
              Mode: <span className="text-foreground">{v.mode}</span>
            </p>
            <p className="mt-2 text-[var(--muted)]">{v.blurb}</p>
            <Link
              href="/strategy"
              className="mt-3 inline-block text-xs text-[var(--accent)] hover:underline"
            >
              Set mode →
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
