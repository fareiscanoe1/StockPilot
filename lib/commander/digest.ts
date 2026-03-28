import type { ScannerSnapshot } from "@/lib/queries/scanner-snapshot";

/** Compact payload for commander AI routes (avoid huge POST bodies). */
export type CommanderScanDigest = {
  mode: string;
  universe: string[];
  universeMode: ScannerSnapshot["universeMode"];
  universeSource: ScannerSnapshot["universeSource"];
  watchlistUniverse: string[];
  discoveryUniverse: string[];
  scanMeta: ScannerSnapshot["scanMeta"];
  dataSources: ScannerSnapshot["dataSources"];
  warnings: string[];
  candidates: Array<{
    symbol: string;
    assetType: string;
    confidence: number;
    riskScore: number;
    strategyViewTag: string;
    isEarningsPlay: boolean;
    thesis: string;
    catalystSummary: string;
    holdingPeriodNote: string;
    rankScore: number;
    trendStrengthScore: number | null;
    liquidityQualityScore: number | null;
    eventEdgeScore: number | null;
    historicalPatternQuality: number | null;
  }>;
  decisions: Array<{
    ticker: string;
    decision: string;
    reasonCode: string | null;
    sourcesMissingCount: number;
  }>;
};

export function buildScanDigest(snap: ScannerSnapshot | null): CommanderScanDigest | null {
  if (!snap) return null;
  return {
    mode: snap.mode,
    universe: snap.universe,
    universeMode: snap.universeMode,
    universeSource: snap.universeSource,
    watchlistUniverse: snap.watchlistUniverse,
    discoveryUniverse: snap.discoveryUniverse,
    scanMeta: snap.scanMeta,
    dataSources: snap.dataSources,
    warnings: snap.dataSources.warnings ?? [],
    candidates: snap.candidates.slice(0, 16).map((c) => ({
      symbol: c.symbol,
      assetType: c.assetType,
      confidence: c.confidence,
      riskScore: c.riskScore,
      strategyViewTag: c.strategyViewTag,
      isEarningsPlay: c.isEarningsPlay,
      thesis: c.thesis.slice(0, 320),
      catalystSummary: c.catalystSummary.slice(0, 200),
      holdingPeriodNote: c.holdingPeriodNote.slice(0, 120),
      rankScore: c.rankScore,
      trendStrengthScore:
        typeof c.facts?.trendStrengthScore === "number" ? c.facts.trendStrengthScore : null,
      liquidityQualityScore:
        typeof c.facts?.liquidityQualityScore === "number" ? c.facts.liquidityQualityScore : null,
      eventEdgeScore: typeof c.facts?.eventEdgeScore === "number" ? c.facts.eventEdgeScore : null,
      historicalPatternQuality:
        typeof c.facts?.historicalPatternQuality === "number"
          ? c.facts.historicalPatternQuality
          : null,
    })),
    decisions: snap.decisions.map((d) => ({
      ticker: d.ticker,
      decision: d.decision,
      reasonCode: d.reasonCode,
      sourcesMissingCount: d.sourcesMissing?.length ?? 0,
    })),
  };
}
