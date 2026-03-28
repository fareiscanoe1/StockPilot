import type { ScannerSnapshot } from "@/lib/queries/scanner-snapshot";
import type {
  CommanderAllocationPlan,
  CommanderAllocationPosture,
  CommanderCategoryAllocation,
  CommanderIdeaAllocation,
  CommanderIdeaRow,
  CommanderPrefs,
} from "./types";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function baseDeployByRisk(risk: CommanderPrefs["riskLevel"]): number {
  if (risk === "low") return 44;
  if (risk === "high") return 76;
  return 60;
}

function postureFromState(
  prefs: CommanderPrefs,
  category: CommanderCategoryAllocation,
  selectedIdeas: CommanderIdeaAllocation[],
): CommanderAllocationPosture {
  if (prefs.primaryMode === "HIGHEST_INCOME") return "high-income";
  if (prefs.primaryMode === "DEFENSIVE") return "defensive";
  if (prefs.primaryMode === "AGGRESSIVE_GROWTH" && category.cashPct <= 30) return "risk-on";
  if (selectedIdeas.length <= 3 && category.cashPct >= 35) return "opportunistic";
  if (category.cashPct >= 50) return "defensive";
  return "balanced";
}

function scoreForAllocation(row: CommanderIdeaRow, prefs: CommanderPrefs): number {
  const watchBoost = row.isWatchlist ? prefs.watchlistPriorityBoost : 0;
  const pinnedBoost = row.isPinned || row.isHighPriority ? prefs.watchlistPriorityBoost * 0.7 : 0;
  return (
    row.probabilityPct * 0.6 +
    row.expectedEdge * 28 +
    row.confidence * 2.4 +
    row.liquidityQualityScore * 0.2 +
    watchBoost +
    pinnedBoost
  );
}

export function buildAllocationPlan(
  rows: CommanderIdeaRow[],
  prefs: CommanderPrefs,
  snap: ScannerSnapshot | null,
): CommanderAllocationPlan {
  const eligible = rows
    .filter((r) => r.stance === "TRADE")
    .filter((r) => r.confidence >= prefs.minConfidenceScore)
    .filter((r) => r.probabilityPct >= prefs.minProbabilityPct)
    .filter((r) => r.liquidityQualityScore >= prefs.minLiquidityScore)
    .filter((r) => !r.ignored && !r.muted)
    .filter((r) => (prefs.toggles.stocksEnabled ? true : r.assetType !== "STOCK"))
    .filter((r) => (prefs.toggles.optionsEnabled ? true : r.assetType !== "OPTION"))
    .filter((r) => (prefs.toggles.earningsEnabled ? true : !r.candidate?.isEarningsPlay));

  const warningsCount = snap?.dataSources?.warnings?.length ?? 0;
  const qualityScore =
    eligible.length > 0
      ? eligible.reduce((s, r) => s + (r.probabilityPct * 0.7 + r.expectedEdge * 20), 0) /
        eligible.length
      : 0;

  const qualityBoost = clamp((qualityScore - 50) * 0.24, -16, 18);
  const providerPenalty = warningsCount > 0 ? clamp(warningsCount * 7, 0, 24) : 0;
  const rawDeploy = baseDeployByRisk(prefs.riskLevel) + qualityBoost - providerPenalty;
  const maxDeploy = 100 - prefs.cashFloorPct;
  const targetDeploy = clamp(rawDeploy, 0, maxDeploy);

  const explanation: string[] = [];
  explanation.push(
    `Deploy target ${round1(targetDeploy)}% from risk=${prefs.riskLevel}, quality=${round1(
      qualityScore,
    )}, provider penalty=${providerPenalty}%.`,
  );
  explanation.push(
    `Inclusion thresholds: confidence >= ${prefs.minConfidenceScore.toFixed(1)}, probability >= ${prefs.minProbabilityPct}%, liquidity >= ${prefs.minLiquidityScore}.`,
  );

  if (!eligible.length) {
    const cashPct = clamp(Math.max(prefs.cashFloorPct, 82), prefs.cashFloorPct, 100);
    const category = {
      stocksPct: 0,
      optionsPct: 0,
      cryptoPct: 0,
      cashPct,
    };
    explanation.push(
      "No qualified ideas met thresholds. Holding elevated cash until statistical edge improves.",
    );
    return {
      posture: postureFromState(prefs, category, []),
      category,
      ideas: [],
      explanation,
    };
  }

  const ranked = [...eligible]
    .sort((a, b) => scoreForAllocation(b, prefs) - scoreForAllocation(a, prefs))
    .slice(0, clamp(Math.round(prefs.maxPositions), 1, 30));

  const scoreMap = new Map<string, number>();
  let scoreSum = 0;
  for (const row of ranked) {
    const s = Math.max(0.1, scoreForAllocation(row, prefs));
    scoreMap.set(row.symbol, s);
    scoreSum += s;
  }

  const byCategory = new Map<"stocks" | "options" | "crypto", number>();
  byCategory.set("stocks", 0);
  byCategory.set("options", 0);
  byCategory.set("crypto", 0);

  const bySectorProxy = new Map<string, number>();
  const selectedIdeas: CommanderIdeaAllocation[] = [];
  let allocated = 0;

  for (const row of ranked) {
    const rawShare = (scoreMap.get(row.symbol) ?? 0) / Math.max(scoreSum, 1e-6);
    const rawWeight = targetDeploy * rawShare;
    const maxPos = clamp(prefs.maxPositionWeightPct, 2, 100);
    const sectorFromFacts = row.candidate?.facts?.sector;
    const sectorKey =
      typeof sectorFromFacts === "string" && sectorFromFacts.trim().length > 0
        ? `SECTOR:${sectorFromFacts.trim().toUpperCase()}`
        : `STRATEGY:${row.category.toUpperCase()}`;
    const currentSector = bySectorProxy.get(sectorKey) ?? 0;
    const sectorRemaining = Math.max(0, prefs.maxSectorConcentrationPct - currentSector);
    const cappedWeight = Math.min(rawWeight, maxPos, sectorRemaining, Math.max(0, targetDeploy - allocated));
    if (cappedWeight <= 0.01) continue;

    allocated += cappedWeight;
    bySectorProxy.set(sectorKey, currentSector + cappedWeight);

    const catKey: "stocks" | "options" | "crypto" =
      row.bucket === "crypto" ? "crypto" : row.assetType === "OPTION" ? "options" : "stocks";
    byCategory.set(catKey, (byCategory.get(catKey) ?? 0) + cappedWeight);

    selectedIdeas.push({
      symbol: row.symbol,
      source: row.source,
      stance: row.stance,
      probabilityPct: row.probabilityPct,
      confidence: row.confidence,
      expectedEdge: row.expectedEdge,
      weightPct: round1(cappedWeight),
      reason: `${row.source.replace(/_/g, " ")} · p=${row.probabilityPct.toFixed(
        0,
      )}% · edge=${row.expectedEdge.toFixed(2)} · liquidity=${row.liquidityQualityScore.toFixed(0)}`,
    });
  }

  const cashPct = clamp(100 - allocated, prefs.cashFloorPct, 100);
  const category: CommanderCategoryAllocation = {
    stocksPct: round1(byCategory.get("stocks") ?? 0),
    optionsPct: round1(byCategory.get("options") ?? 0),
    cryptoPct: round1(byCategory.get("crypto") ?? 0),
    cashPct: round1(cashPct),
  };

  if (!prefs.toggles.optionsEnabled && category.optionsPct > 0) {
    explanation.push("Options disabled by settings, but historical candidate rows were still visible.");
  } else if (prefs.toggles.optionsEnabled) {
    explanation.push(
      category.optionsPct > 0
        ? "Options allocation increased where edge and liquidity cleared thresholds."
        : "Options allocation reduced due to weak edge/liquidity this cycle.",
    );
  }
  if (!prefs.toggles.cryptoEnabled || category.cryptoPct <= 0) {
    explanation.push(
      "Crypto allocation held low/zero because strict real-data crypto path is unavailable or disabled.",
    );
  }
  explanation.push(
    `Cash ${category.cashPct.toFixed(1)}% reflects floor=${prefs.cashFloorPct}% plus unallocated risk budget after caps (max position ${prefs.maxPositionWeightPct}%, sector cap ${prefs.maxSectorConcentrationPct}%).`,
  );
  explanation.push(
    "Sector concentration uses vendor fundamentals sector when available; otherwise falls back to strategy bucket.",
  );

  return {
    posture: postureFromState(prefs, category, selectedIdeas),
    category,
    ideas: selectedIdeas.sort((a, b) => b.weightPct - a.weightPct),
    explanation,
  };
}
