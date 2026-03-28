import type { StrategyMode } from "@prisma/client";

export interface RiskParams {
  maxPositionPct: number;
  maxPortfolioHeatPct: number;
  maxOptionsPremiumAtRiskPct: number;
  maxSectorPct: number;
  maxBidAskSpreadPct: number;
  minAvgDailyVolume: number;
  minOpenInterest: number;
  dailyMaxLossLockoutPct: number;
  weeklyMaxDrawdownLockoutPct: number;
  allowHighEventRisk: boolean;
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
        minAvgDailyVolume: 400_000,
        minOpenInterest: 200,
        dailyMaxLossLockoutPct: 6,
        weeklyMaxDrawdownLockoutPct: 15,
        allowHighEventRisk: true,
      };
    case "DEFENSIVE":
      return {
        maxPositionPct: 8,
        maxPortfolioHeatPct: 45,
        maxOptionsPremiumAtRiskPct: 4,
        maxSectorPct: 20,
        maxBidAskSpreadPct: 2,
        minAvgDailyVolume: 1_500_000,
        minOpenInterest: 800,
        dailyMaxLossLockoutPct: 2,
        weeklyMaxDrawdownLockoutPct: 6,
        allowHighEventRisk: false,
      };
    case "EARNINGS_HUNTER":
      return {
        maxPositionPct: 12,
        maxPortfolioHeatPct: 65,
        maxOptionsPremiumAtRiskPct: 8,
        maxSectorPct: 30,
        maxBidAskSpreadPct: 3.5,
        minAvgDailyVolume: 800_000,
        minOpenInterest: 400,
        dailyMaxLossLockoutPct: 4,
        weeklyMaxDrawdownLockoutPct: 12,
        allowHighEventRisk: true,
      };
    case "OPTIONS_MOMENTUM":
      return {
        maxPositionPct: 10,
        maxPortfolioHeatPct: 55,
        maxOptionsPremiumAtRiskPct: 15,
        maxSectorPct: 28,
        maxBidAskSpreadPct: 3,
        minAvgDailyVolume: 1_000_000,
        minOpenInterest: 1000,
        dailyMaxLossLockoutPct: 4,
        weeklyMaxDrawdownLockoutPct: 12,
        allowHighEventRisk: false,
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
        minAvgDailyVolume: 750_000,
        minOpenInterest: 500,
        dailyMaxLossLockoutPct: 3,
        weeklyMaxDrawdownLockoutPct: 10,
        allowHighEventRisk: false,
      };
  }
};
