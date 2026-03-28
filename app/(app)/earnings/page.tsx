import { auth } from "@/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import {
  getDataStackSummary,
  getEarningsDataAdapter,
} from "@/lib/adapters/provider-factory";
import { EarningsPageClient } from "@/components/EarningsPageClient";
import { serializeEarningsEventsForClient } from "@/lib/serializers/earnings-cache";

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
  const cachedRaw = await prisma.earningsEvent.findMany({
    orderBy: { datetimeUtc: "asc" },
    take: 50,
  });
  const cached = serializeEarningsEventsForClient(cachedRaw);

  const scanLabelHint =
    syms.length > 0 ? `${syms.length} watchlist symbols` : "Default 5-name universe";

  return (
    <EarningsPageClient
      stack={stack}
      rows={rows}
      cached={cached}
      adapterOk={Boolean(adapter)}
      scanLabelHint={scanLabelHint}
    />
  );
}
