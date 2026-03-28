import type { SymbolQuoteDiagnostics } from "@/lib/adapters/quote-diagnostics";

export function ScannerQuoteDebugPanel({
  rows,
}: {
  rows: SymbolQuoteDiagnostics[];
}) {
  return (
    <div className="card space-y-4 p-4 text-xs">
      <div>
        <h2 className="text-sm font-medium text-foreground">Quote debug (first symbols)</h2>
        <p className="mt-1 text-[var(--muted)]">
          Raw HTTP bodies plus the same normalized quote the scanner uses. Enable with{" "}
          <code className="text-foreground">?debug=1</code> or{" "}
          <code className="text-foreground">SCANNER_QUOTE_DEBUG=1</code>.
        </p>
      </div>
      {rows.map((row) => (
        <div
          key={row.symbol}
          className="rounded-lg border border-[var(--border)] bg-black/20 p-3"
        >
          <p className="font-mono text-sm text-foreground">{row.symbol}</p>
          {row.notes.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-amber-200/90">
              {row.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[10px] uppercase tracking-wide text-[var(--muted)]">
            Normalized (pipeline)
          </p>
          <pre className="mt-1 max-h-40 overflow-auto rounded bg-black/40 p-2 text-[10px] text-[var(--muted)]">
            {JSON.stringify(row.normalizedPipeline, null, 2)}
          </pre>
          <details className="mt-2">
            <summary className="cursor-pointer text-foreground">Raw Polygon snapshot</summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-black/40 p-2 text-[10px]">
              {JSON.stringify(row.raw.polygonSnapshot, null, 2)}
            </pre>
          </details>
          <details className="mt-2">
            <summary className="cursor-pointer text-foreground">Raw Polygon NBBO (v2/last/nbbo)</summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-black/40 p-2 text-[10px]">
              {JSON.stringify(row.raw.polygonNbbo, null, 2)}
            </pre>
          </details>
          <details className="mt-2">
            <summary className="cursor-pointer text-foreground">Raw Finnhub quote + bid/ask</summary>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-black/40 p-2 text-[10px]">
              {JSON.stringify(
                { quote: row.raw.finnhubQuote, bidAsk: row.raw.finnhubBidAsk },
                null,
                2,
              )}
            </pre>
          </details>
        </div>
      ))}
    </div>
  );
}
