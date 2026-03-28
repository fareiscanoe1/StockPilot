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
  const rawSymbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!rawSymbol) {
    return NextResponse.json(
      {
        ok: false,
        simulatedOnly: true,
        symbol: null,
        chain: null,
        optionsDisabled: false,
        dataSource: null,
        realDataStatus: "BLOCKED",
        blockedReason:
          "Missing symbol. Provide /api/options?symbol=XYZ (e.g. AAPL) to fetch a real Polygon options chain.",
      },
      { status: 400 },
    );
  }
  const symbol = rawSymbol;
  const adapter = getOptionsDataAdapter();
  if (!adapter) {
    return NextResponse.json(
      {
        ok: false,
        simulatedOnly: true,
        symbol,
        chain: null,
        optionsDisabled: true,
        dataSource: null,
        realDataStatus: "BLOCKED",
        blockedReason: "POLYGON_API_KEY required — real options chains are disabled.",
        note: "STRICT mode: no mock chains and no synthetic options fills.",
      },
      { status: 503 },
    );
  }

  const probe = adapter.getChainProbe
    ? await adapter.getChainProbe(symbol)
    : { chain: await adapter.getChain(symbol), httpStatus: null, providerMessage: null, totalContracts: 0, liquidContracts: 0 };
  const chain = probe.chain;
  if (!chain) {
    const providerTail = probe.providerMessage
      ? ` Provider says: ${probe.providerMessage}`
      : "";
    const httpTail = probe.httpStatus ? ` (HTTP ${probe.httpStatus})` : "";
    return NextResponse.json(
      {
        ok: false,
        simulatedOnly: true,
        symbol,
        chain: null,
        optionsDisabled: false,
        dataSource: "POLYGON",
        realDataStatus: "BLOCKED",
        blockedReason:
          `No liquid real chain returned from Polygon${httpTail} for ${symbol}.` +
          providerTail,
        providerHttpStatus: probe.httpStatus,
        providerMessage: probe.providerMessage,
        totalContracts: probe.totalContracts,
        liquidContracts: probe.liquidContracts,
        note: "STRICT mode does not fabricate strikes.",
      },
      { status: 200 },
    );
  }

  return NextResponse.json({
    ok: true,
    simulatedOnly: true,
    symbol,
    chain,
    optionsDisabled: false,
    dataSource: chain.source ?? "POLYGON",
    realDataStatus: "REAL_DATA_USED",
    liquidStrikeCount: probe.liquidContracts || chain.strikes.length,
    totalContracts: probe.totalContracts || chain.strikes.length,
    note: "Illiquid strikes filtered before simulated orders. Source: POLYGON only.",
  });
}
