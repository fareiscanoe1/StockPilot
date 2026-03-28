import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/db";
import { getMarketDataAdapter } from "@/lib/adapters/provider-factory";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId");
  const where = {
    virtualAccount: { userId: session.user.id },
    ...(accountId ? { virtualAccountId: accountId } : {}),
  };
  const holdings = await prisma.holding.findMany({
    where,
    include: { virtualAccount: true, optionContract: true },
  });
  const market = getMarketDataAdapter();
  const withMarks = await Promise.all(
    holdings.map(async (h) => {
      const q = market ? await market.getQuote(h.symbol) : null;
      const last = q?.last ?? Number(h.avgCost);
      const qty = Number(h.quantity);
      const cost = qty * Number(h.avgCost);
      const mkt = qty * last;
      return {
        ...h,
        last,
        unrealized: mkt - cost,
      };
    }),
  );
  return NextResponse.json({ simulatedOnly: true, positions: withMarks });
}
