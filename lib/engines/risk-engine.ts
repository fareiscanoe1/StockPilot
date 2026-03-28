import type { StrategyMode } from "@prisma/client";
import { defaultRiskForMode, type RiskParams } from "./risk-params";

export interface LiquidityProbe {
  avgVolume: number;
  bid: number;
  ask: number;
  openInterest?: number;
}

export class RiskEngine {
  constructor(
    private mode: StrategyMode,
    private overrides?: Partial<RiskParams>,
  ) {}

  params(): RiskParams {
    const base = defaultRiskForMode(this.mode);
    return { ...base, ...this.overrides };
  }

  liquidityOk(probe: LiquidityProbe): { ok: boolean; reason?: string } {
    const p = this.params();
    if (probe.avgVolume < p.minAvgDailyVolume) {
      return { ok: false, reason: "Volume below minimum liquidity threshold." };
    }
    const mid = (probe.bid + probe.ask) / 2;
    const spreadPct =
      mid > 0 ? ((probe.ask - probe.bid) / mid) * 100 : Number.POSITIVE_INFINITY;
    if (spreadPct > p.maxBidAskSpreadPct) {
      return { ok: false, reason: "Bid-ask spread too wide for simulated execution." };
    }
    if (
      probe.openInterest !== undefined &&
      probe.openInterest < p.minOpenInterest
    ) {
      return { ok: false, reason: "Open interest too low for options simulation." };
    }
    return { ok: true };
  }

  positionSizeNotional(
    portfolioValue: number,
    proposedNotional: number,
  ): { ok: boolean; reason?: string } {
    const p = this.params();
    const max = (portfolioValue * p.maxPositionPct) / 100;
    if (proposedNotional > max) {
      return {
        ok: false,
        reason: `Exceeds max position size (${p.maxPositionPct}% of portfolio).`,
      };
    }
    return { ok: true };
  }

  heatOk(currentGrossExposure: number, portfolioValue: number): boolean {
    const p = this.params();
    const heat = portfolioValue > 0 ? (currentGrossExposure / portfolioValue) * 100 : 0;
    return heat <= p.maxPortfolioHeatPct + 1e-6;
  }
}
