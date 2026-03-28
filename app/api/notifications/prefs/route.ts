import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId: session.user.id },
  });
  return NextResponse.json({ prefs });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as Partial<{
    inAppEnabled: boolean;
    emailEnabled: boolean;
    telegramEnabled: boolean;
    telegramChatId: string | null;
    discordEnabled: boolean;
    discordWebhookUrl: string | null;
    smsEnabled: boolean;
    smsTo: string | null;
  }>;

  const prefs = await prisma.notificationPreference.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      inAppEnabled: body.inAppEnabled ?? true,
      emailEnabled: body.emailEnabled ?? false,
      telegramEnabled: body.telegramEnabled ?? false,
      telegramChatId: body.telegramChatId ?? null,
      discordEnabled: body.discordEnabled ?? false,
      discordWebhookUrl: body.discordWebhookUrl ?? null,
      smsEnabled: body.smsEnabled ?? false,
      smsTo: body.smsTo ?? null,
    },
    update: {
      ...(body.inAppEnabled !== undefined && { inAppEnabled: body.inAppEnabled }),
      ...(body.emailEnabled !== undefined && { emailEnabled: body.emailEnabled }),
      ...(body.telegramEnabled !== undefined && { telegramEnabled: body.telegramEnabled }),
      ...(body.telegramChatId !== undefined && { telegramChatId: body.telegramChatId }),
      ...(body.discordEnabled !== undefined && { discordEnabled: body.discordEnabled }),
      ...(body.discordWebhookUrl !== undefined && {
        discordWebhookUrl: body.discordWebhookUrl,
      }),
      ...(body.smsEnabled !== undefined && { smsEnabled: body.smsEnabled }),
      ...(body.smsTo !== undefined && { smsTo: body.smsTo }),
    },
  });
  return NextResponse.json({ prefs });
}
