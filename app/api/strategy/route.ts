import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/db";
import type { StrategyMode } from "@prisma/client";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const profile = await prisma.strategyProfile.findUnique({
    where: { userId: session.user.id },
  });
  return NextResponse.json({ profile });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    mode?: StrategyMode;
    customRules?: object;
    riskParams?: object;
  };
  const profile = await prisma.strategyProfile.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      mode: body.mode ?? "BALANCED",
      customRules: body.customRules,
      riskParams: body.riskParams,
    },
    update: {
      mode: body.mode,
      customRules: body.customRules,
      riskParams: body.riskParams,
    },
  });
  return NextResponse.json({ profile });
}
