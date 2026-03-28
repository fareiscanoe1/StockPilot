import { Suspense } from "react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import {
  getDataStackSummary,
  getOptionsDataAdapter,
} from "@/lib/adapters/provider-factory";
import { OptionsPageClient } from "@/components/OptionsPageClient";

export default async function OptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const sp = await searchParams;
  const fallbackWatch = await prisma.watchlistSymbol.findFirst({
    where: { watchlist: { userId: session.user.id } },
    orderBy: { symbol: "asc" },
  });
  const raw = sp.symbol ?? fallbackWatch?.symbol ?? "";
  const symbol = raw.trim().toUpperCase();
  const adapter = getOptionsDataAdapter();
  const chain = adapter && symbol ? await adapter.getChain(symbol) : null;
  const stack = getDataStackSummary();

  return (
    <Suspense
      fallback={<div className="p-6 text-sm text-[var(--muted)]">Loading options…</div>}
    >
      <OptionsPageClient
        stack={stack}
        serverSymbol={symbol}
        initialChain={chain}
        optionsDisabled={!adapter}
      />
    </Suspense>
  );
}
