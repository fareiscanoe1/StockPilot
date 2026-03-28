import type { DataStackSummary } from "@/lib/adapters/provider-factory";

export function ProviderStackPanel({
  stack,
  title = "Active provider stack (STRICT)",
}: {
  stack: DataStackSummary;
  title?: string;
}) {
  const missingCore =
    stack.quotes === "unavailable" ||
    stack.candles === "unavailable" ||
    stack.news === "unavailable";

  return (
    <div className="rounded-lg border border-[var(--border)] bg-black/25 px-3 py-2 text-xs text-[var(--muted)]">
      <div className="font-medium text-foreground">{title}</div>
      <div className="mt-1 grid gap-1 sm:grid-cols-2">
        <div>
          Quotes: <span className="text-foreground">{stack.quotes}</span>
        </div>
        <div>
          Candles: <span className="text-foreground">{stack.candles}</span>
        </div>
        <div>
          Fundamentals: <span className="text-foreground">{stack.fundamentals}</span>
        </div>
        <div>
          Options chain: <span className="text-foreground">{stack.options}</span>
        </div>
        <div>
          Earnings calendar: <span className="text-foreground">{stack.earnings}</span>
        </div>
        <div>
          News: <span className="text-foreground">{stack.news}</span>
        </div>
        <div className="sm:col-span-2">
          Open-web research:{" "}
          <span className="text-foreground">{stack.webResearch}</span>
          <span className="ml-1 text-[10px] opacity-80">
            (supplemental context only — not market data)
          </span>
        </div>
      </div>
      {stack.warnings.length > 0 && (
        <ul className="mt-2 list-inside list-disc space-y-1 text-amber-200/90">
          {stack.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {missingCore && (
        <p className="mt-2 border-t border-[var(--border)] pt-2 text-amber-200">
          This strategy is unavailable because required real data is missing. Configure API keys
          in <code className="text-foreground">.env.local</code> — the app will not fabricate
          quotes or news.
        </p>
      )}
    </div>
  );
}
