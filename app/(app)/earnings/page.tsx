import { auth } from "@/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import {
  getDataStackSummary,
  getEarningsDataAdapter,
} from "@/lib/adapters/provider-factory";
import { ProviderStackPanel } from "@/components/ProviderStackPanel";

export default async function EarningsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const watch = await prisma.watchlistSymbol.findMany({
    where: { watchlist: { userId: session.user.id } },
  });
  const syms = watch.map((w) => w.symbol);
  const adapter = getEarningsDataAdapter();
  const rows = adapter
    ? await adapter.getUpcoming(30, syms.length ? syms : undefined)
    : [];
  const stack = getDataStackSummary();
  const cached = await prisma.earningsEvent.findMany({
    orderBy: { datetimeUtc: "asc" },
    take: 50,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Earnings calendar</h1>
      <ProviderStackPanel stack={stack} />
      <p className="text-sm text-[var(--muted)]">
        Finnhub earnings calendar and DB cache — verify against your data vendor before acting.
      </p>
      {!adapter && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          This strategy is unavailable because required real data is missing. Set{" "}
          <code className="text-foreground">FINNHUB_API_KEY</code> for the earnings calendar.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="text-sm font-medium text-[var(--muted)]">Adapter (Finnhub)</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {rows.map((r) => (
              <li key={r.symbol + (r.datetimeUtc ?? "")} className="flex justify-between">
                <span>
                  {r.symbol}{" "}
                  <span className="text-xs text-[var(--muted)]">({r.source})</span>
                </span>
                <span className="text-[var(--muted)]">
                  {r.datetimeUtc?.slice(0, 10) ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-4">
          <h2 className="text-sm font-medium text-[var(--muted)]">Database cache</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {cached.map((e) => (
              <li key={e.id} className="flex justify-between">
                <span>
                  {e.symbol}{" "}
                  <span className="text-xs text-[var(--muted)]">({e.dataSource})</span>
                </span>
                <span className="text-[var(--muted)]">
                  {e.datetimeUtc?.toISOString().slice(0, 10) ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
