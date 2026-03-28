import nodemailer from "nodemailer";
import type { NotificationChannel } from "@prisma/client";

export interface NotificationPayload {
  title: string;
  body: string;
  channel: NotificationChannel;
  meta?: Record<string, unknown>;
}

/** Outbound notifications — email, Telegram, Discord, SMS stub. */
export interface NotificationAdapter {
  send(
    payload: NotificationPayload,
    prefs: {
      email?: string | null;
      smtp?: {
        host: string;
        port: number;
        user?: string;
        pass?: string;
        from: string;
      };
      telegram?: { botToken: string; chatId: string };
      discordWebhookUrl?: string | null;
      smsWebhookUrl?: string | null;
      smsTo?: string | null;
    },
  ): Promise<{ ok: boolean; error?: string }>;
}

export class CompositeNotificationAdapter implements NotificationAdapter {
  async send(
    payload: NotificationPayload,
    prefs: Parameters<NotificationAdapter["send"]>[1],
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      if (payload.channel === "EMAIL" && prefs.email && prefs.smtp) {
        const t = nodemailer.createTransport({
          host: prefs.smtp.host,
          port: prefs.smtp.port,
          secure: prefs.smtp.port === 465,
          auth:
            prefs.smtp.user && prefs.smtp.pass
              ? { user: prefs.smtp.user, pass: prefs.smtp.pass }
              : undefined,
        });
        await t.sendMail({
          from: prefs.smtp.from,
          to: prefs.email,
          subject: payload.title,
          text: payload.body,
        });
        return { ok: true };
      }
      if (
        payload.channel === "TELEGRAM" &&
        prefs.telegram?.botToken &&
        prefs.telegram.chatId
      ) {
        const url = `https://api.telegram.org/bot${prefs.telegram.botToken}/sendMessage`;
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: prefs.telegram.chatId,
            text: `${payload.title}\n\n${payload.body}`,
          }),
        });
        if (!r.ok) return { ok: false, error: await r.text() };
        return { ok: true };
      }
      if (payload.channel === "DISCORD" && prefs.discordWebhookUrl) {
        const r = await fetch(prefs.discordWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `**${payload.title}**\n${payload.body}`.slice(0, 1900),
          }),
        });
        if (!r.ok) return { ok: false, error: await r.text() };
        return { ok: true };
      }
      if (
        payload.channel === "SMS" &&
        prefs.smsWebhookUrl &&
        prefs.smsTo
      ) {
        const r = await fetch(prefs.smsWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: prefs.smsTo,
            body: `${payload.title} — ${payload.body}`.slice(0, 480),
          }),
        });
        if (!r.ok) return { ok: false, error: await r.text() };
        return { ok: true };
      }
      if (payload.channel === "IN_APP" || payload.channel === "WEB_PUSH") {
        return { ok: true };
      }
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }
}
