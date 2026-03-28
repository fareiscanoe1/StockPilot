import { auth } from "@/auth";
import prisma from "@/lib/db";
import {
  getDataStackSummary,
  getMarketDataAdapter,
} from "@/lib/adapters/provider-factory";
import { ProviderStackPanel } from "@/components/ProviderStackPanel";
import { PortfolioSimulator } from "@/lib/engines/portfolio-simulator";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const userId = session.user.id;
  const accounts = await prisma.virtualAccount.findMany({
    where: { userId },
    include: { holdings: true },
  });
  const market = getMarketDataAdapter();
  const dataStack = getDataStackSummary();
  const marks: Record<string, number> = {};
  const symbols = new Set<string>();
  accounts.forEach((a) => a.holdings.forEach((h) => symbols.add(h.symbol)));
  if (market) {
    for (const s of symbols) {
      const q = await market.getQuote(s);
      if (q) marks[s] = q.last;
    }
  }
  let totalEquity = 0;
  const exposure: Record<string, number> = {};
  for (const a of accounts) {
    totalEquity += await PortfolioSimulator.portfolioValue(a.id, marks);
    for (const h of a.holdings) {
      const sec = h.sector ?? "UNKNOWN";
      const px = marks[h.symbol] ?? Number(h.avgCost);
      exposure[sec] = (exposure[sec] ?? 0) + Number(h.quantity) * px;
    }
  }
  const alerts = await prisma.alert.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const earn = await prisma.earningsEvent.findMany({
    where: { datetimeUtc: { gte: new Date() } },
    orderBy: { datetimeUtc: "asc" },
    take: 6,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Desk overview</h1>
        <p className="text-sm text-[var(--muted)]">
          Aggregated virtual accounts — not connected to any live broker.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Virtual equity (marked)</p>
          <p className="mt-1 text-2xl font-semibold">
            ${totalEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Sandbox accounts</p>
          <p className="mt-1 text-2xl font-semibold">{accounts.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Open lots</p>
          <p className="mt-1 text-2xl font-semibold">
            {accounts.reduce((s, a) => s + a.holdings.length, 0)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Upcoming earnings (cached)</p>
          <p className="mt-1 text-2xl font-semibold">{earn.length}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="text-sm font-medium text-[var(--muted)]">Accounts</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex justify-between rounded-lg border border-[var(--border)] bg-black/20 px-3 py-2"
              >
                <span>{a.name}</span>
                <span className="text-[var(--muted)]">{a.subPortfolio}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/portfolio"
            className="mt-3 inline-block text-xs text-[var(--accent)] hover:underline"
          >
            Open simulated portfolio →
          </Link>
        </div>
        <div className="card p-4">
          <h2 className="text-sm font-medium text-[var(--muted)]">Sector exposure</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {Object.entries(exposure).map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span>{k}</span>
                <span>${v.toFixed(0)}</span>
              </li>
            ))}
            {Object.keys(exposure).length === 0 && (
              <li className="text-[var(--muted)]">No open positions.</li>
            )}
          </ul>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3 p-4">
          <ProviderStackPanel stack={dataStack} title="Data stack (desk + alerts)" />
          <h2 className="text-sm font-medium text-[var(--muted)]">Latest AI actions</h2>
          <ul className="mt-3 space-y-2 text-xs text-[var(--muted)]">
            {alerts.map((a) => (
              <li key={a.id} className="border-l-2 border-[var(--accent)] pl-2">
                <span className="text-foreground">{a.title}</span>
                <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-[10px]">
                  {a.body}
                </pre>
              </li>
            ))}
            {alerts.length === 0 && <li>No alerts yet. Run a scan from cron/worker.</li>}
          </ul>
        </div>
        <div className="card p-4">
          <h2 className="text-sm font-medium text-[var(--muted)]">Upcoming earnings</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {earn.map((e) => (
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
