import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getScannerSnapshot } from "@/lib/queries/scanner-snapshot";
import { ProviderStackPanel } from "@/components/ProviderStackPanel";

export default async function ScannerPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const snap = await getScannerSnapshot(session.user.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Market scanner</h1>
        <p className="text-sm text-[var(--muted)]">
          Mode <strong className="text-foreground">{snap.mode}</strong> · virtual book $
          {snap.portfolioValue.toFixed(0)}
        </p>
        <div className="mt-3">
          <ProviderStackPanel stack={snap.dataSources} />
        </div>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-black/20 text-xs text-[var(--muted)]">
            <tr>
              <th className="p-3">Symbol</th>
              <th className="p-3">Asset</th>
              <th className="p-3">Confidence</th>
              <th className="p-3">Risk</th>
              <th className="p-3">Earnings</th>
              <th className="p-3">Strategy</th>
              <th className="p-3">Sources</th>
            </tr>
          </thead>
          <tbody>
            {snap.candidates.map((c) => {
              const p = c.facts.provenance as Record<string, string | null> | undefined;
              return (
                <tr key={c.symbol + c.assetType} className="border-b border-[var(--border)]">
                  <td className="p-3 font-mono">{c.symbol}</td>
                  <td className="p-3">{c.assetType}</td>
                  <td className="p-3">{c.confidence.toFixed(1)}</td>
                  <td className="p-3">{c.riskScore.toFixed(1)}</td>
                  <td className="p-3">{c.isEarningsPlay ? "yes" : "no"}</td>
                  <td className="p-3 text-xs text-[var(--muted)]">{c.strategyTag}</td>
                  <td className="p-3 align-top text-[10px] leading-tight text-[var(--muted)]">
                    <div>q: {p?.quotes ?? "—"}</div>
                    <div>c: {p?.candles ?? "—"}</div>
                    <div>e: {p?.earningsCalendar ?? "—"}</div>
                    <div>n: {p?.news ?? "—"}</div>
                    <div>o: {p?.optionsChain ?? "—"}</div>
                    <div>web: {p?.webResearch ?? "—"}</div>
                    <div>AI: {p?.reasoning ?? "—"}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {snap.candidates.length === 0 && (
          <p className="p-6 text-sm text-[var(--muted)]">
            No TRADE candidates this run. Required real data may be missing, or score and liquidity
            gates failed. See engine decisions below.
          </p>
        )}
      </div>
      <div className="card overflow-hidden">
        <h2 className="border-b border-[var(--border)] bg-black/20 px-3 py-2 text-sm font-medium">
          Engine decisions (TRADE / NO_TRADE)
        </h2>
        <div className="max-h-80 overflow-auto text-xs">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-[#070b12] text-[var(--muted)]">
              <tr>
                <th className="p-2">Ticker</th>
                <th className="p-2">Decision</th>
                <th className="p-2">Reason</th>
                <th className="p-2">Used</th>
                <th className="p-2">Missing</th>
              </tr>
            </thead>
            <tbody>
              {snap.decisions.map((d, i) => (
                <tr key={`${d.ticker}-${i}`} className="border-b border-[var(--border)]/60">
                  <td className="p-2 font-mono">{d.ticker}</td>
                  <td className="p-2">{d.decision}</td>
                  <td className="p-2 text-[var(--muted)]">{d.reasonCode ?? "—"}</td>
                  <td className="p-2 text-[10px] text-[var(--muted)]">
                    {JSON.stringify(d.sourcesUsed)}
                  </td>
                  <td className="p-2 text-[10px] text-amber-200/80">
                    {d.sourcesMissing.length ? d.sourcesMissing.join(", ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <details className="card p-4 text-xs text-[var(--muted)]">
        <summary className="cursor-pointer text-foreground">Sample thesis / facts</summary>
        <div className="mt-3 space-y-3">
          {snap.candidates.slice(0, 3).map((c) => (
            <div key={c.symbol}>
              <p className="text-foreground">{c.symbol}</p>
              <p>Thesis (inference): {c.thesis}</p>
              <pre className="mt-1 max-h-32 overflow-auto rounded bg-black/30 p-2 text-[10px]">
                {JSON.stringify({ facts: c.facts, invalidation: c.invalidation }, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
