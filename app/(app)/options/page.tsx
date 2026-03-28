import { auth } from "@/auth";
import { redirect } from "next/navigation";
import {
  getDataStackSummary,
  getOptionsDataAdapter,
} from "@/lib/adapters/provider-factory";
import { ProviderStackPanel } from "@/components/ProviderStackPanel";

export default async function OptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const sp = await searchParams;
  const symbol = sp.symbol ?? "NVDA";
  const adapter = getOptionsDataAdapter();
  const chain = adapter ? await adapter.getChain(symbol) : null;
  const stack = getDataStackSummary();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Options opportunities</h1>
      <ProviderStackPanel stack={stack} title="Options require Polygon" />
      <p className="text-sm text-[var(--muted)]">
        Chain snapshot for liquidity screening. Illiquid strikes are excluded. No mock option
        chains.
      </p>
      <p className="text-xs text-[var(--muted)]">
        Query: <code>?symbol=AAPL</code>
      </p>
      {!adapter && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          This strategy is unavailable because required real data is missing. Set{" "}
          <code className="text-foreground">POLYGON_API_KEY</code> for live options chains.
        </p>
      )}
      <div className="card overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] text-xs text-[var(--muted)]">
            <tr>
              <th className="p-2">Strike</th>
              <th className="p-2">Expiry</th>
              <th className="p-2">R</th>
              <th className="p-2">Bid</th>
              <th className="p-2">Ask</th>
              <th className="p-2">OI</th>
              <th className="p-2">IV</th>
            </tr>
          </thead>
          <tbody>
            {chain?.strikes.map((s, i) => (
              <tr key={i} className="border-b border-[var(--border)]">
                <td className="p-2 font-mono">{s.strike}</td>
                <td className="p-2">{s.expiry}</td>
                <td className="p-2">{s.right}</td>
                <td className="p-2">{s.bid.toFixed(2)}</td>
                <td className="p-2">{s.ask.toFixed(2)}</td>
                <td className="p-2">{s.openInterest ?? "—"}</td>
                <td className="p-2">{s.impliedVol?.toFixed(2) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!chain && adapter && (
          <p className="p-4 text-sm text-[var(--muted)]">
            No Polygon chain returned for {symbol} (illiquid or unavailable).
          </p>
        )}
      </div>
    </div>
  );
}
