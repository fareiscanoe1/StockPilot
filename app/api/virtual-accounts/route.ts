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

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    accountId?: string;
    name?: string;
    startingCash?: number;
    cashBalance?: number;
    cashDelta?: number;
    subPortfolio?: SubPortfolioType;
  };

  const accountId = body.accountId?.trim();
  if (!accountId) {
    return NextResponse.json({ error: "accountId required" }, { status: 400 });
  }

  const existing = await prisma.virtualAccount.findFirst({
    where: { id: accountId, userId: session.user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const data: {
    name?: string;
    subPortfolio?: SubPortfolioType;
    startingCash?: Decimal;
    cashBalance?: Decimal;
  } = {};

  if (typeof body.name === "string" && body.name.trim()) {
    data.name = body.name.trim().slice(0, 80);
  }
  if (body.subPortfolio && Object.values(SubPortfolioType).includes(body.subPortfolio)) {
    data.subPortfolio = body.subPortfolio;
  }
  if (body.startingCash != null) {
    if (!Number.isFinite(body.startingCash) || body.startingCash < 0) {
      return NextResponse.json(
        { error: "startingCash must be a non-negative number" },
        { status: 400 },
      );
    }
    data.startingCash = new Decimal(body.startingCash);
  }
  if (body.cashBalance != null && body.cashDelta != null) {
    return NextResponse.json(
      { error: "Provide either cashBalance or cashDelta, not both" },
      { status: 400 },
    );
  }
  if (body.cashBalance != null) {
    if (!Number.isFinite(body.cashBalance) || body.cashBalance < 0) {
      return NextResponse.json(
        { error: "cashBalance must be a non-negative number" },
        { status: 400 },
      );
    }
    data.cashBalance = new Decimal(body.cashBalance);
  }
  if (body.cashDelta != null) {
    if (!Number.isFinite(body.cashDelta)) {
      return NextResponse.json({ error: "cashDelta must be a number" }, { status: 400 });
    }
    const next = Number(existing.cashBalance) + body.cashDelta;
    if (next < 0) {
      return NextResponse.json(
        { error: "cashDelta would make cash balance negative" },
        { status: 400 },
      );
    }
    data.cashBalance = new Decimal(next);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const account = await prisma.virtualAccount.update({
    where: { id: existing.id },
    data,
  });
  return NextResponse.json({ account });
}
