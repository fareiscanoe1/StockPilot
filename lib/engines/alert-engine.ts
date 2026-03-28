import type {
  AssetType,
  NotificationChannel,
  SimulatedAction,
} from "@prisma/client";
import prisma from "@/lib/db";
import {
  CompositeNotificationAdapter,
  type NotificationPayload,
} from "@/lib/adapters/notification-adapter";
import { env } from "@/lib/env";

export interface TradeAlertBody {
  ticker: string;
  assetType: AssetType;
  action: SimulatedAction;
  entryPrice: number;
  size: number;
  stopLoss?: number;
  targetOrExit: string;
  confidence: number;
  strategyTag: string;
  reason: string;
  isEarningsRelated: boolean;
  timestamp: string;
  /** Exact vendor labels used for this idea (quotes, candles, options, etc.). */
  dataProvenance?: Record<string, string | null>;
}

export class AlertEngine {
  private notifier = new CompositeNotificationAdapter();

  async notifyTrade(userId: string, alert: TradeAlertBody) {
    const disclaimer =
      "\n\n— Executed in virtual portfolio only. Not financial advice. Copy-manually at your own risk.\n— REAL DATA ONLY: no mock market data; verify all figures with your broker.";

    const provLines =
      alert.dataProvenance && Object.keys(alert.dataProvenance).length
        ? [
            "Data provenance (vendor labels):",
            ...Object.entries(alert.dataProvenance).map(
              ([k, v]) => `  ${k}: ${v ?? "n/a"}`,
            ),
          ]
        : [];

    const text = [
      `SIMULATED ${alert.action}: ${alert.ticker} (${alert.assetType}) @ ${alert.entryPrice.toFixed(2)}`,
      `Size: ${alert.size} | Confidence ${alert.confidence.toFixed(1)}/10`,
      `Strategy: ${alert.strategyTag}`,
      alert.stopLoss != null ? `Stop: ${alert.stopLoss.toFixed(2)}` : "Stop: per risk profile",
      `Target / exit logic: ${alert.targetOrExit}`,
      `Earnings-related: ${alert.isEarningsRelated ? "yes" : "no"}`,
      `Why: ${alert.reason}`,
      `Time: ${alert.timestamp}`,
      ...provLines,
      disclaimer,
    ].join("\n");

    await prisma.alert.create({
      data: {
        userId,
        title: `Simulated ${alert.action} ${alert.ticker}`,
        body: text,
        payload: alert as unknown as object,
      },
    });

    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId },
    });

    const user = await prisma.user.findUnique({ where: { id: userId } });

    const channels: NotificationChannel[] = ["IN_APP"];
    if (prefs?.emailEnabled) channels.push("EMAIL");
    if (prefs?.telegramEnabled) channels.push("TELEGRAM");
    if (prefs?.discordEnabled) channels.push("DISCORD");
    if (prefs?.smsEnabled) channels.push("SMS");

    const smtp =
      env.SMTP_HOST && env.EMAIL_FROM
        ? {
            host: env.SMTP_HOST,
            port: Number(env.SMTP_PORT ?? "587"),
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
            from: env.EMAIL_FROM,
          }
        : undefined;

    for (const channel of channels) {
      const payload: NotificationPayload = {
        title: `Earnings Pilot AI — ${alert.ticker}`,
        body: text,
        channel,
      };

      const res = await this.notifier.send(payload, {
        email: user?.email,
        smtp: smtp && user?.email ? smtp : undefined,
        telegram:
          prefs?.telegramEnabled && prefs.telegramChatId && env.TELEGRAM_BOT_TOKEN
            ? { botToken: env.TELEGRAM_BOT_TOKEN, chatId: prefs.telegramChatId }
            : undefined,
        discordWebhookUrl: prefs?.discordWebhookUrl,
        smsWebhookUrl: env.SMS_WEBHOOK_URL,
        smsTo: prefs?.smsTo,
      });

      await prisma.notification.create({
        data: {
          userId,
          channel,
          title: payload.title,
          body: text,
          status: res.ok ? "SENT" : "FAILED",
          meta: res.error ? { error: res.error } : undefined,
        },
      });
    }
  }
}
