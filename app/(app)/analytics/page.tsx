import { auth } from "@/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { PriceChart } from "@/components/PriceChart";
import { getMarketDataAdapter } from "@/lib/adapters/provider-factory";
import {
  listSignalOutcomeReviews,
  refreshStaleSignalOutcomes,
} from "@/lib/queries/signal-outcomes";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const market = getMarketDataAdapter();
  const refreshed = await refreshStaleSignalOutcomes(session.user.id, market, 5);
  const outcomes = await listSignalOutcomeReviews(session.user.id, 25);
  const backtests = await prisma.backtestRun.findMany({
    where: { userId: session.user.id },
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  const to = new Date();
  const from = new Date(to.getTime() - 180 * 86400000);
  const candles = market
    ? await market.getCandles("SPY", "1d", from, to)
    : [];
  const chartData = candles.map((c) => ({
    time: c.t,
    o: c.o,
    h: c.h,
    l: c.l,
    c: c.c,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Performance analytics</h1>
      <p className="text-sm text-[var(--muted)]">
        Backtest runs, signal outcome QA (thesis vs mark after horizon), and replay logs. Outcomes
        are descriptive only — not used to train models.
      </p>
      <div className="card p-4 text-sm">
        <h2 className="text-sm font-medium text-[var(--muted)]">AI trade idea outcomes</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Compared mark vs signal price for aged TRADE logs (≥5 sessions). New rows this load:{" "}
          <span className="text-foreground">{refreshed.created}</span>
        </p>
        <ul className="mt-3 max-h-64 space-y-2 overflow-auto text-xs">
          {outcomes.map((o) => (
            <li key={o.id} className="border-b border-[var(--border)] pb-2">
              <span className="font-mono text-foreground">{o.ticker}</span>{" "}
              <span className="text-[var(--muted)]">
                {o.returnPct != null ? `${Number(o.returnPct).toFixed(2)}%` : "—"} · mark{" "}
                {o.markPrice != null ? Number(o.markPrice).toFixed(2) : "—"}
              </span>
              {o.thesisSnapshot && (
                <p className="mt-1 text-[10px] text-[var(--muted)] line-clamp-2">
                  Thesis: {o.thesisSnapshot}
                </p>
              )}
            </li>
          ))}
        </ul>
        {outcomes.length === 0 && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            No reviews yet — need TRADE logs older than the horizon and a live quote adapter.
          </p>
        )}
      </div>
      <div className="card p-4">
        <h2 className="text-sm font-medium text-[var(--muted)]">
          Sample chart (SPY daily — adapter source labeled in data)
        </h2>
        <div className="mt-3">
          {!market && (
            <p className="mb-2 text-sm text-amber-200">
              Live chart disabled: no market data adapter (set POLYGON_API_KEY or FINNHUB_API_KEY).
            </p>
          )}
          <PriceChart data={chartData} />
        </div>
      </div>
      <div className="card p-4">
        <h2 className="text-sm font-medium text-[var(--muted)]">Backtests</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {backtests.map((b) => (
            <li key={b.id} className="flex justify-between border-b border-[var(--border)] pb-2">
              <span>{b.name}</span>
              <span className="text-[var(--muted)]">
                {b.completedAt ? "done" : "running"}{" "}
                {b.result &&
                  typeof b.result === "object" &&
                  "finalEquity" in (b.result as object) &&
                  `→ $${Number((b.result as { finalEquity: number }).finalEquity).toFixed(0)}`}
              </span>
            </li>
          ))}
        </ul>
        {backtests.length === 0 && (
          <p className="text-sm text-[var(--muted)]">
            POST /api/backtest with JSON body to enqueue a run.
          </p>
        )}
      </div>
    </div>
  );
}
