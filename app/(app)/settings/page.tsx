import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getDataStackSummary } from "@/lib/adapters/provider-factory";
import { ProviderStackPanel } from "@/components/ProviderStackPanel";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const stack = getDataStackSummary();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="card space-y-3 p-4 text-sm text-[var(--muted)]">
        <p>
          <strong className="text-foreground">DATA_PROVIDER:</strong> {env.DATA_PROVIDER}
        </p>
        <p className="text-xs">
          The app runs in <strong className="text-foreground">STRICT</strong> real-data mode
          only. Missing API keys disable the related features; nothing downgrades to mock market
          data.
        </p>
        <ProviderStackPanel stack={stack} title="Resolved provider stack" />
        <p>
          Database URL configured: <code className="text-xs">{Boolean(env.DATABASE_URL)}</code>
        </p>
        <p>
          Polygon key present:{" "}
          <code className="text-xs">{Boolean(process.env.POLYGON_API_KEY)}</code>
        </p>
        <p>
          Finnhub key present:{" "}
          <code className="text-xs">{Boolean(process.env.FINNHUB_API_KEY)}</code>
        </p>
        <p>
          Tavily key present:{" "}
          <code className="text-xs">{Boolean(process.env.TAVILY_API_KEY)}</code>
        </p>
        <p className="border-t border-[var(--border)] pt-3 text-xs">
          Tavily is optional open-web research only — labeled separately from Finnhub news and
          never substitutes for quotes, earnings, fundamentals, or options chains.
        </p>
      </div>
    </div>
  );
}
