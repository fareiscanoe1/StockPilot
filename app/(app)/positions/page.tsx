import { auth } from "@/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getMarketDataAdapter } from "@/lib/adapters/provider-factory";

export default async function PositionsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const holdings = await prisma.holding.findMany({
    where: { virtualAccount: { userId: session.user.id } },
    include: { virtualAccount: true },
  });
  const market = getMarketDataAdapter();

  const rows = await Promise.all(
    holdings.map(async (h) => {
      const q = market ? await market.getQuote(h.symbol) : null;
      const last = q?.last ?? Number(h.avgCost);
      const qty = Number(h.quantity);
      const cost = qty * Number(h.avgCost);
      const mkt = qty * last;
      return { h, last, unrealized: mkt - cost };
    }),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Open positions</h1>
      <div className="card overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] text-xs text-[var(--muted)]">
            <tr>
              <th className="p-2">Book</th>
              <th className="p-2">Symbol</th>
              <th className="p-2">Type</th>
              <th className="p-2">Qty</th>
              <th className="p-2">Avg</th>
              <th className="p-2">Last</th>
              <th className="p-2">UPL</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ h, last, unrealized }) => (
              <tr key={h.id} className="border-b border-[var(--border)]">
                <td className="p-2 text-xs text-[var(--muted)]">{h.virtualAccount.name}</td>
                <td className="p-2 font-mono">{h.symbol}</td>
                <td className="p-2">{h.assetType}</td>
                <td className="p-2">{Number(h.quantity).toFixed(4)}</td>
                <td className="p-2">{Number(h.avgCost).toFixed(2)}</td>
                <td className="p-2">{last.toFixed(2)}</td>
                <td
                  className={`p-2 ${unrealized >= 0 ? "text-[var(--gain)]" : "text-[var(--loss)]"}`}
                >
                  {unrealized.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-4 text-sm text-[var(--muted)]">No open positions.</p>
        )}
      </div>
    </div>
  );
}
