import { auth } from "@/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getMarketDataAdapter } from "@/lib/adapters/provider-factory";
import { PortfolioSimulator } from "@/lib/engines/portfolio-simulator";

export default async function PortfolioPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const accounts = await prisma.virtualAccount.findMany({
    where: { userId: session.user.id },
    include: { holdings: true },
  });
  const market = getMarketDataAdapter();
  const marks: Record<string, number> = {};
  if (market) {
    for (const a of accounts) {
      for (const h of a.holdings) {
        if (marks[h.symbol] == null) {
          const q = await market.getQuote(h.symbol);
          if (q) marks[h.symbol] = q.last;
        }
      }
    }
  }

  const cards = await Promise.all(
    accounts.map(async (a) => {
      const equity = await PortfolioSimulator.portfolioValue(a.id, marks);
      return { a, equity };
    }),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Simulated portfolio</h1>
      <p className="text-sm text-[var(--muted)]">
        Separate virtual sub-books — starting cash you set via seed or API.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map(({ a, equity }) => (
          <div key={a.id} className="card p-4">
            <div className="flex justify-between">
              <h2 className="font-medium">{a.name}</h2>
              <span className="text-xs text-[var(--muted)]">{a.subPortfolio}</span>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Cash: ${Number(a.cashBalance).toLocaleString()}
            </p>
            <p className="text-lg font-semibold">
              Marked equity: ${equity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Positions: {a.holdings.length}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
