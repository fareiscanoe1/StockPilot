import prisma from "@/lib/db";
import type { MarketDataAdapter } from "@/lib/adapters/market-data-adapter";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * Computes simple mark-to-market outcomes for past TRADE recommendations (analytics only).
 * Does not feed back into model weights.
 */
export async function refreshStaleSignalOutcomes(
  userId: string,
  market: MarketDataAdapter | null,
  horizonDays = 5,
) {
  if (!market) return { created: 0 };

  const cutoff = new Date(Date.now() - horizonDays * 86400000);
  const logs = await prisma.recommendationLog.findMany({
    where: {
      userId,
      decision: "TRADE",
      tradeAllowed: true,
      createdAt: { lte: cutoff },
    },
    orderBy: { createdAt: "desc" },
    take: 80,
  });

  let created = 0;
  for (const log of logs) {
    const existing = await prisma.signalOutcomeReview.findUnique({
      where: { recommendationLogId: log.id },
    });
    if (existing) continue;

    const payload = log.decisionPayload as {
      facts?: { last?: number };
      thesis?: string;
    } | null;
    const signalPx = payload?.facts?.last;
    if (signalPx == null || !Number.isFinite(signalPx)) continue;

    const q = await market.getQuote(log.ticker);
    const mark = q?.last;
    if (mark == null || !Number.isFinite(mark)) continue;

    const retPct = ((mark - signalPx) / signalPx) * 100;
    const thesisSnap = (payload?.thesis ?? "").slice(0, 4000);

    await prisma.signalOutcomeReview.create({
      data: {
        userId,
        recommendationLogId: log.id,
        ticker: log.ticker,
        horizonDays,
        signalPrice: new Decimal(signalPx),
        markPrice: new Decimal(mark),
        returnPct: new Decimal(retPct),
        thesisSnapshot: thesisSnap.slice(0, 4000) || null,
        outcomeNotes: `Mark ${mark.toFixed(2)} vs signal ${signalPx.toFixed(2)} after ≥${horizonDays}d (not predictive; desk QA only).`,
      },
    });
    created += 1;
  }

  return { created };
}

export async function listSignalOutcomeReviews(userId: string, take = 30) {
  return prisma.signalOutcomeReview.findMany({
    where: { userId },
    orderBy: { computedAt: "desc" },
    take,
    include: {
      recLog: { select: { ticker: true, createdAt: true, decision: true } },
    },
  });
}
