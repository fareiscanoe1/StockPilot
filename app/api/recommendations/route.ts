import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/db";

export const runtime = "nodejs";

/** AI rationale / decision logs — facts vs inference stored in JSON payload. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const take = Number(url.searchParams.get("take") ?? "50");
  const rows = await prisma.recommendationLog.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take,
  });
  return NextResponse.json({ logs: rows });
}
