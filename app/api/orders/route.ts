import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId");
  const orders = await prisma.simulatedOrder.findMany({
    where: {
      virtualAccount: { userId: session.user.id },
      ...(accountId ? { virtualAccountId: accountId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { fills: true, virtualAccount: true },
  });
  return NextResponse.json({ simulatedOnly: true, orders });
}
