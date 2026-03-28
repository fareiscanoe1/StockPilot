import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await prisma.alert.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ alerts: rows });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, read } = (await req.json()) as { id?: string; read?: boolean };
  if (!id || read === undefined) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  await prisma.alert.updateMany({
    where: { id, userId: session.user.id },
    data: { read },
  });
  return NextResponse.json({ ok: true });
}
