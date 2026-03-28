import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const lists = await prisma.watchlist.findMany({
    where: { userId: session.user.id },
    include: { symbols: true },
  });
  return NextResponse.json({ watchlists: lists });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    watchlistId?: string;
    symbol?: string;
    exchange?: string;
    name?: string;
  };
  if (body.name && !body.watchlistId) {
    const wl = await prisma.watchlist.create({
      data: { userId: session.user.id, name: body.name },
    });
    return NextResponse.json({ watchlist: wl });
  }
  if (!body.watchlistId || !body.symbol) {
    return NextResponse.json({ error: "watchlistId and symbol required" }, { status: 400 });
  }
  const row = await prisma.watchlistSymbol.create({
    data: {
      watchlistId: body.watchlistId,
      symbol: body.symbol.toUpperCase(),
      exchange: body.exchange ?? "US",
    },
  });
  return NextResponse.json({ symbol: row });
}
