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

  /** Stocks when consolidated bid/ask is missing: enforce volume only (NBBO not used for spread). */
  liquidityOkStockVolumeOnly(probe: { avgVolume: number }): { ok: boolean; reason?: string } {
    const p = this.params();
    if (probe.avgVolume < p.minAvgDailyVolume) {
      return { ok: false, reason: "Volume below minimum liquidity threshold." };
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

  stockMinPriceOk(lastUsd: number): { ok: boolean; reason?: string } {
    const p = this.params();
    if (lastUsd < p.minStockPriceUsd) {
      return {
        ok: false,
        reason: `Price below minimum ($${p.minStockPriceUsd}) for this profile.`,
      };
    }
    return { ok: true };
  }

  /** Long-bias stock setups: require non-downtrend structure from engine trend score. */
  stockTrendConfirmationOk(technicalTrend01: number): { ok: boolean; reason?: string } {
    const p = this.params();
    if (technicalTrend01 < p.stockTrendMinScore) {
      return {
        ok: false,
        reason: `Trend score ${technicalTrend01.toFixed(2)} below minimum ${p.stockTrendMinScore} for this mode.`,
      };
    }
    return { ok: true };
  }

  /**
   * Earnings-hunter: require upcoming earnings between min/max days (inclusive).
   * `daysUntil` = (earnings datetime - now) / 1d; null if unknown.
   */
  earningsProximityOk(daysUntil: number | null): { ok: boolean; reason?: string } {
    const p = this.params();
    if (daysUntil == null || !Number.isFinite(daysUntil)) {
      return { ok: false, reason: "Earnings date unknown — cannot verify proximity window." };
    }
    if (daysUntil < p.earningsWindowMinDays || daysUntil > p.earningsWindowMaxDays) {
      return {
        ok: false,
        reason: `Earnings in ${daysUntil.toFixed(1)}d — outside allowed ${p.earningsWindowMinDays}–${p.earningsWindowMaxDays}d window.`,
      };
    }
    return { ok: true };
  }
}
