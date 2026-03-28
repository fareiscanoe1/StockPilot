import type { AssetType, StrategyMode } from "@prisma/client";
import type { StrategyCandidate } from "./strategy-engine";

export function daysUntilUtc(isoOrDate: string | undefined, now = new Date()): number | null {
  if (!isoOrDate) return null;
  const t = new Date(isoOrDate).getTime();
  if (!Number.isFinite(t)) return null;
  return (t - now.getTime()) / 86400000;
}

export function resolveStrategyViewTag(input: {
  mode: StrategyMode;
  isEarningsPlay: boolean;
  daysUntilEarnings: number | null;
}): string {
  if (input.mode === "OPTIONS_MOMENTUM") return "options_momentum";
  if (input.mode === "DEFENSIVE") return "defensive_setup";
  if (input.mode === "EARNINGS_HUNTER") {
    const d = input.daysUntilEarnings;
    if (d != null && d >= 0 && d <= 3) return "earnings_breakout";
    if (d != null && d > 3) return "pre_earnings_setup";
    return "earnings_calendar";
  }
  if (input.mode === "AGGRESSIVE") return "momentum_swing_aggressive";
  return "momentum_swing";
}

/**
 * Higher = better sort order. Uses confidence, liquidity quality, event edge, risk inverse.
 */
export function computeRankScore(input: {
  confidence: number;
  riskScore: number;
  underlyingNbboObserved: boolean;
  spreadPct: number;
  avgDailyVolume: number;
  isEarningsPlay: boolean;
  daysUntilEarnings: number | null;
  assetType: AssetType;
}): number {
  const liq =
    (input.underlyingNbboObserved ? 2.4 : 1) +
    Math.min(2, Math.log10(1 + input.avgDailyVolume / 500_000)) -
    Math.min(1.5, input.spreadPct / 5);

  const eventEdge =
    input.isEarningsPlay && input.daysUntilEarnings != null && input.daysUntilEarnings >= 0
      ? 1.2 + Math.max(0, 1 - input.daysUntilEarnings / 14)
      : 0;

  const rr = 10 / (1 + Math.max(0, input.riskScore));

  const optBoost = input.assetType === "OPTION" ? 0.35 : 0;

  return input.confidence * 3.2 + liq * 1.8 + eventEdge + rr * 0.6 + optBoost;
}

export function rankAndSplitCandidates(candidates: StrategyCandidate[]): {
  ranked: StrategyCandidate[];
  stocks: StrategyCandidate[];
  options: StrategyCandidate[];
} {
  const ranked = [...candidates].sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0));
  const stocks = ranked.filter((c) => c.assetType === "STOCK");
  const options = ranked.filter((c) => c.assetType === "OPTION");
  return { ranked, stocks, options };
}
