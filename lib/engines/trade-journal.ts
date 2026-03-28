import { Decimal } from "@prisma/client/runtime/library";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import type { StrategyCandidate, StrictDecisionRecord } from "./strategy-engine";

export class TradeJournal {
  /** Persists one strict engine outcome (TRADE or NO_TRADE) with provenance. */
  static async logStrictDecision(
    userId: string,
    virtualAccountId: string | undefined,
    record: StrictDecisionRecord,
    candidate?: StrategyCandidate,
  ) {
    const decision = record.decision === "TRADE" ? "TRADE" : "NO_TRADE";
    const assetType = candidate?.assetType ?? "STOCK";
    const confidence = candidate?.confidence ?? 0;
    const riskScore = candidate?.riskScore ?? 0;

    const decisionPayload = candidate
      ? (JSON.parse(
          JSON.stringify({
            facts: candidate.facts,
            inference: candidate.inferences,
            thesis: candidate.thesis,
            invalidation: candidate.invalidation,
            strategyTag: candidate.strategyTag,
            isEarningsPlay: candidate.isEarningsPlay,
            strict: {
              timestamp: record.timestamp,
              reasonCode: record.reasonCode,
              provenance: record.provenance,
              sourcesUsed: record.sourcesUsed,
              sourcesMissing: record.sourcesMissing,
            },
            note: "Inference and model scores are not predictions of market outcomes.",
          }),
        ) as Prisma.InputJsonValue)
      : (JSON.parse(
          JSON.stringify({
            strictOnly: true,
            timestamp: record.timestamp,
            strategy: record.strategy,
            reasonCode: record.reasonCode,
            provenance: record.provenance,
            sourcesUsed: record.sourcesUsed,
            sourcesMissing: record.sourcesMissing,
            note: "NO_TRADE — required real data missing or gates failed.",
          }),
        ) as Prisma.InputJsonValue);

    await prisma.recommendationLog.create({
      data: {
        userId,
        virtualAccountId,
        ticker: record.ticker,
        assetType,
        decision,
        reasonCode: record.reasonCode,
        sourcesUsed: record.sourcesUsed as Prisma.InputJsonValue,
        sourcesMissing: record.sourcesMissing as Prisma.InputJsonValue,
        tradeAllowed: record.decision === "TRADE",
        confidence: new Decimal(confidence),
        riskScore: new Decimal(riskScore),
        decisionPayload,
      },
    });
  }

}
