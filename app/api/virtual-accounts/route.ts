import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/db";
import { Decimal } from "@prisma/client/runtime/library";
import { SubPortfolioType } from "@prisma/client";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await prisma.virtualAccount.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ accounts: rows });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    name?: string;
    startingCash?: number;
    subPortfolio?: SubPortfolioType;
  };
  const name = body.name?.trim() || "New sandbox";
  const cash = body.startingCash ?? 25_000;
  const sub = body.subPortfolio ?? SubPortfolioType.SWING;
  const acc = await prisma.virtualAccount.create({
    data: {
      userId: session.user.id,
      name,
      subPortfolio: sub,
      startingCash: new Decimal(cash),
      cashBalance: new Decimal(cash),
    },
  });
  return NextResponse.json({ account: acc });
}
