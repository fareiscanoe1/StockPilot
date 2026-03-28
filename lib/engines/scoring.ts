/**
 * Heuristic multi-factor scoring (legacy reference). Production scans use OpenAI structured
 * reasoning in `strategy-engine.ts` + `openai-reasoning.ts` instead of `scoreOpportunity`.
 */
import type { StrategyMode } from "@prisma/client";

export interface FactorInputs {
  technicalTrend: number;
  momentum: number;
  earningsEdge: number;
  valuationZ: number;
  balanceSheet: number;
  /** Only used when newsSkipped is false — real aggregated sentiment from news adapter */
  newsSentiment: number;
  /** When true, news weight is redistributed (no neutral “fake” sentiment). */
  newsSkipped?: boolean;
  optionsQuality: number;
  /** When true, options factor weight redistributed (non-options strategies). */
  optionsSkipped?: boolean;
  portfolioFit: number;
  macroRisk: number;
}

export interface ScoringResult {
  trade: boolean;
  confidence: number;
  riskScore: number;
  thesis: string;
  invalidation: string;
  expectedHoldDays: number;
  deltasFromPrior?: string;
}

const weightsBalanced = {
  technicalTrend: 0.15,
  momentum: 0.15,
  earningsEdge: 0.15,
  valuationZ: 0.1,
  balanceSheet: 0.08,
  newsSentiment: 0.12,
  optionsQuality: 0.1,
  portfolioFit: 0.1,
  macroRisk: 0.05,
};

export function scoreOpportunity(
  mode: StrategyMode,
  f: FactorInputs,
  priorSummary?: string,
): ScoringResult {
  const w = { ...weightsBalanced };
  if (mode === "EARNINGS_HUNTER") {
    w.earningsEdge = 0.28;
    w.technicalTrend = 0.12;
  }
  if (mode === "OPTIONS_MOMENTUM") {
    w.optionsQuality = 0.22;
    w.momentum = 0.2;
  }
  if (mode === "DEFENSIVE") {
    w.balanceSheet = 0.14;
    w.macroRisk = 0.1;
  }
  if (mode === "AGGRESSIVE") {
    w.momentum = 0.22;
    w.earningsEdge = 0.12;
  }

  let newsTerm = 0;
  if (f.newsSkipped) {
    const nw = w.newsSentiment;
    w.newsSentiment = 0;
    w.momentum += nw * 0.55;
    w.technicalTrend += nw * 0.45;
  } else {
    newsTerm = ((f.newsSentiment + 1) / 2) * w.newsSentiment;
  }

  let optionsTerm = 0;
  if (f.optionsSkipped) {
    const ow = w.optionsQuality;
    w.optionsQuality = 0;
    w.momentum += ow * 0.5;
    w.technicalTrend += ow * 0.5;
  } else {
    optionsTerm = f.optionsQuality * w.optionsQuality;
  }

  const macroAdj = 1 - f.macroRisk;

  const raw =
    f.technicalTrend * w.technicalTrend +
    f.momentum * w.momentum +
    f.earningsEdge * w.earningsEdge +
    f.valuationZ * w.valuationZ +
    f.balanceSheet * w.balanceSheet +
    newsTerm +
    optionsTerm +
    f.portfolioFit * w.portfolioFit +
    macroAdj * w.macroRisk;

  const confidence = Math.min(10, Math.max(0, raw * 10));
  const optionsRisk = f.optionsSkipped ? 0 : (1 - f.optionsQuality) * 4;
  const riskScore = Math.min(
    10,
    Math.max(0, optionsRisk + f.macroRisk * 3 + (1 - f.balanceSheet) * 3),
  );
  const trade = confidence >= 5.2 && riskScore <= 7;

  const thesisParts: string[] = [];
  if (f.newsSkipped) thesisParts.push("News sentiment skipped (no Finnhub headlines or adapter missing).");
  if (f.earningsEdge > 0.65)
    thesisParts.push("Earnings window context (from real calendar when available).");
  if (f.momentum > 0.55) thesisParts.push("Momentum factor supportive.");
  if (f.optionsQuality > 0.55) thesisParts.push("Options liquidity checks passed on Polygon chain.");
  if (thesisParts.length === 0)
    thesisParts.push("Multi-factor alignment modest — size conservatively in simulation.");

  return {
    trade,
    confidence: Math.round(confidence * 10) / 10,
    riskScore: Math.round(riskScore * 10) / 10,
    thesis: thesisParts.join(" "),
    invalidation:
      "Breakdown below defined stop / time stop / adverse event risk beyond profile tolerance.",
    expectedHoldDays: mode === "EARNINGS_HUNTER" ? 5 : mode === "OPTIONS_MOMENTUM" ? 14 : 21,
    deltasFromPrior: priorSummary
      ? `Vs prior scan: blended score moved (${(raw * 10).toFixed(1)} model units) — ${priorSummary}`
      : undefined,
  };
}
