import type { StrategyMode } from "@prisma/client";

export interface RiskParams {
  maxPositionPct: number;
  maxPortfolioHeatPct: number;
  maxOptionsPremiumAtRiskPct: number;
  maxSectorPct: number;
  maxBidAskSpreadPct: number;
  minAvgDailyVolume: number;
  minOpenInterest: number;
  /** Minimum last-day volume on an option contract (Polygon chain). */
  minOptionContractVolume: number;
  dailyMaxLossLockoutPct: number;
  weeklyMaxDrawdownLockoutPct: number;
  allowHighEventRisk: boolean;
  /** Ignore stocks trading below this USD price (penny / garbage filter). */
  minStockPriceUsd: number;
  /** Require technical_trend_score >= this for long-bias stock setups (0–1). */
  stockTrendMinScore: number;
  /** Earnings hunter: only symbols with earnings in [min, max] calendar days. */
  earningsWindowMinDays: number;
  earningsWindowMaxDays: number;
  /** Options: DTE must fall in [min, max] (exclusive of expired). */
  optionMinDaysToExpiry: number;
  optionMaxDaysToExpiry: number;
}

export const defaultRiskForMode = (mode: StrategyMode): RiskParams => {
  switch (mode) {
    case "AGGRESSIVE":
      return {
        maxPositionPct: 18,
        maxPortfolioHeatPct: 85,
        maxOptionsPremiumAtRiskPct: 12,
        maxSectorPct: 35,
        maxBidAskSpreadPct: 4,
        minAvgDailyVolume: 900_000,
        minOpenInterest: 300,
        minOptionContractVolume: 25,
        dailyMaxLossLockoutPct: 6,
        weeklyMaxDrawdownLockoutPct: 15,
        allowHighEventRisk: true,
        minStockPriceUsd: 7,
        stockTrendMinScore: 0.42,
        earningsWindowMinDays: 1,
        earningsWindowMaxDays: 14,
        optionMinDaysToExpiry: 14,
        optionMaxDaysToExpiry: 120,
      };
    case "DEFENSIVE":
      return {
        maxPositionPct: 8,
        maxPortfolioHeatPct: 45,
        maxOptionsPremiumAtRiskPct: 4,
        maxSectorPct: 20,
        maxBidAskSpreadPct: 2,
        minAvgDailyVolume: 2_000_000,
        minOpenInterest: 1200,
        minOptionContractVolume: 150,
        dailyMaxLossLockoutPct: 2,
        weeklyMaxDrawdownLockoutPct: 6,
        allowHighEventRisk: false,
        minStockPriceUsd: 15,
        stockTrendMinScore: 0.55,
        earningsWindowMinDays: 2,
        earningsWindowMaxDays: 10,
        optionMinDaysToExpiry: 21,
        optionMaxDaysToExpiry: 90,
      };
    case "EARNINGS_HUNTER":
      return {
        maxPositionPct: 12,
        maxPortfolioHeatPct: 65,
        maxOptionsPremiumAtRiskPct: 8,
        maxSectorPct: 30,
        maxBidAskSpreadPct: 3.5,
        minAvgDailyVolume: 1_200_000,
        minOpenInterest: 500,
        minOptionContractVolume: 75,
        dailyMaxLossLockoutPct: 4,
        weeklyMaxDrawdownLockoutPct: 12,
        allowHighEventRisk: true,
        minStockPriceUsd: 10,
        stockTrendMinScore: 0.48,
        earningsWindowMinDays: 1,
        earningsWindowMaxDays: 12,
        optionMinDaysToExpiry: 14,
        optionMaxDaysToExpiry: 100,
      };
    case "OPTIONS_MOMENTUM":
      return {
        maxPositionPct: 10,
        maxPortfolioHeatPct: 55,
        maxOptionsPremiumAtRiskPct: 15,
        maxSectorPct: 28,
        maxBidAskSpreadPct: 2.8,
        minAvgDailyVolume: 1_500_000,
        minOpenInterest: 1500,
        minOptionContractVolume: 100,
        dailyMaxLossLockoutPct: 4,
        weeklyMaxDrawdownLockoutPct: 12,
        allowHighEventRisk: false,
        minStockPriceUsd: 12,
        stockTrendMinScore: 0.5,
        earningsWindowMinDays: 0,
        earningsWindowMaxDays: 365,
        optionMinDaysToExpiry: 21,
        optionMaxDaysToExpiry: 75,
      };
    case "CUSTOM":
    case "BALANCED":
    default:
      return {
        maxPositionPct: 12,
        maxPortfolioHeatPct: 60,
        maxOptionsPremiumAtRiskPct: 8,
        maxSectorPct: 25,
        maxBidAskSpreadPct: 2.5,
        minAvgDailyVolume: 1_000_000,
        minOpenInterest: 800,
        minOptionContractVolume: 50,
        dailyMaxLossLockoutPct: 3,
        weeklyMaxDrawdownLockoutPct: 10,
        allowHighEventRisk: false,
        minStockPriceUsd: 10,
        stockTrendMinScore: 0.5,
        earningsWindowMinDays: 1,
        earningsWindowMaxDays: 14,
        optionMinDaysToExpiry: 18,
        optionMaxDaysToExpiry: 90,
      };
  }
};
