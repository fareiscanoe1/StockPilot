import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOptionsDataAdapter } from "@/lib/adapters/provider-factory";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol") ?? "AAPL";
  const adapter = getOptionsDataAdapter();
  const chain = adapter ? await adapter.getChain(symbol) : null;
  return NextResponse.json({
    simulatedOnly: true,
    symbol,
    chain,
    optionsDisabled: !adapter,
    note: adapter
      ? "Illiquid strikes filtered before simulated orders. Source: POLYGON only."
      : "POLYGON_API_KEY required — no mock option chains.",
  });
}
