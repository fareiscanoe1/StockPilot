import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getScannerSnapshot } from "@/lib/queries/scanner-snapshot";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await getScannerSnapshot(session.user.id);
  return NextResponse.json(body);
}
