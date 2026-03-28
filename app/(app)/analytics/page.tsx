import { auth } from "@/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { PriceChart } from "@/components/PriceChart";
import { getMarketDataAdapter } from "@/lib/adapters/provider-factory";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const backtests = await prisma.backtestRun.findMany({
    where: { userId: session.user.id },
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  const market = getMarketDataAdapter();
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
        Backtest runs and replay logs. Strategy attribution expands with more fill history.
      </p>
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
