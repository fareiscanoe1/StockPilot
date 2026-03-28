import type { ScannerSnapshot, ScannerSymbolMeta } from "@/lib/queries/scanner-snapshot";
import { REASON, type StrictDecisionRecord, type StrategyCandidate } from "@/lib/engines/strategy-engine";
import { buildAllocationPlan } from "./allocation";
import type {
  CommanderIdeaRow,
  CommanderIdeaSource,
  CommanderPrefs,
  CommanderRawSignals,
  CommanderUncertainty,
  IdeaBucket,
  IdeaStance,
} from "./types";

const INCOME_RE = /\b(dividend|yield|income|covered call|premium|cash flow)\b/i;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function looksIncome(row: CommanderIdeaRow): boolean {
  return INCOME_RE.test(row.thesis) || INCOME_RE.test(row.catalyst);
}

function reasonLabel(code: string | null): string {
  if (!code) return "—";
  const map: Record<string, string> = {
    [REASON.OPENAI_DECISION_NO_TRADE]: "OpenAI returned NO_TRADE",
    [REASON.OPENAI_REASONING_FAILED]: "OpenAI request failed",
    [REASON.OPENAI_REASONING_UNAVAILABLE]: "OpenAI unavailable (no key)",
    [REASON.OPTIONS_SPREAD_TOO_WIDE]: "Options spread too wide",
    [REASON.OPTIONS_NO_QUALIFYING_STRIKE]: "No qualifying option strike",
    [REASON.OPTIONS_CHAIN_UNAVAILABLE]: "Options chain unavailable",
    [REASON.OPTIONS_CONTRACT_NBBO_MISSING]: "Options NBBO missing",
    [REASON.STOCK_LIQUIDITY_RULE_FAIL]: "Stock liquidity filter failed",
    [REASON.STOCK_TREND_RULE_FAIL]: "Trend rule failed",
    [REASON.MISSING_STOCK_VOLUME]: "Missing volume",
    [REASON.INSUFFICIENT_CANDLE_HISTORY]: "Insufficient candle history",
    [REASON.QUOTE_PROVIDER_NULL]: "Quote unavailable",
    [REASON.MISSING_MARKET_ADAPTER]: "Market adapter missing",
    [REASON.EARNINGS_PROXIMITY_FAIL]: "Earnings proximity filter",
    [REASON.POSITION_SIZE_RULE_FAIL]: "Position size / risk cap",
  };
  return map[code] ?? code;
}

function resolveSource(meta: ScannerSymbolMeta | undefined): CommanderIdeaSource {
  if (!meta) return "ai_discovered";
  if (meta.source === "explicit_symbol") return "explicit_symbol";
  if (meta.source === "custom_universe") return "custom_universe";
  if (meta.inWatchlist && meta.inDiscovery) return "watchlist_discovery_match";
  if (meta.inWatchlist && (meta.pinned || meta.highPriority)) return "pinned_watchlist";
  if (meta.inWatchlist) return "watchlist";
  return "ai_discovered";
}

function resolveStance(c: StrategyCandidate | null, d: StrictDecisionRecord | null): IdeaStance {
  if (!d) return c ? "TRADE" : "NO_TRADE";
  if (d.decision === "TRADE") return "TRADE";
  if (d.reasonCode === REASON.OPENAI_DECISION_NO_TRADE && c && c.confidence >= 6) return "WATCH";
  if (
    d.reasonCode === REASON.OPTIONS_SPREAD_TOO_WIDE ||
    d.reasonCode === REASON.OPTIONS_NO_QUALIFYING_STRIKE ||
    d.reasonCode === REASON.OPTIONS_CONTRACT_NBBO_MISSING
  ) {
    return "WATCH";
  }
  if (c && c.confidence >= 6.5) return "WATCH";
  return "NO_TRADE";
}

function assignBucket(
  c: StrategyCandidate | null,
  stance: IdeaStance,
  prefs: CommanderPrefs,
): IdeaBucket {
  if (stance === "NO_TRADE") return "avoid";
  if (stance === "WATCH") return "watchlist_only";
  if (prefs.primaryMode === "CRYPTO_FOCUS" && prefs.toggles.cryptoEnabled) return "crypto";
  if (c?.assetType === "OPTION") return "options";
  if (c?.strategyViewTag === "defensive_setup" || prefs.toggles.defensiveBias) return "defensive";
  if (c && (INCOME_RE.test(c.thesis) || INCOME_RE.test(c.catalystSummary))) return "highest_income";
  if (prefs.primaryMode === "HIGHEST_INCOME") return "highest_income";
  if (c?.strategyViewTag?.includes("earnings") || c?.isEarningsPlay) return "aggressive_growth";
  if (prefs.toggles.incomePriority && c) return "highest_income";
  if (prefs.primaryMode === "DEFENSIVE") return "defensive";
  return "aggressive_growth";
}

function numericFact(c: StrategyCandidate | null, key: string): number | null {
  const v = c?.facts?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function buildSignals(c: StrategyCandidate | null): CommanderRawSignals {
  const trend = numericFact(c, "trendStrengthScore") ?? clamp((c?.confidence ?? 0) * 10, 5, 95);
  const liq = numericFact(c, "liquidityQualityScore") ?? clamp(45 + (c?.confidence ?? 0) * 4, 10, 98);
  const hist = numericFact(c, "historicalPatternQuality") ?? clamp(trend * 0.7 + liq * 0.2, 8, 98);
  const event = numericFact(c, "eventEdgeScore") ?? clamp(c?.isEarningsPlay ? 65 : 42, 5, 95);
  const rr = numericFact(c, "rewardRiskEstimate") ?? clamp((c ? (c.confidence + (10 - c.riskScore)) / 8 : 0.8), 0.2, 3.5);
  return {
    trendStrengthScore: trend,
    liquidityQualityScore: liq,
    historicalPatternQuality: hist,
    eventEdgeScore: event,
    rewardRiskEstimate: rr,
  };
}

function computeProbability(c: StrategyCandidate | null, s: CommanderRawSignals): number {
  if (!c) return 0;
  const confPart = c.confidence * 5.6;
  const signalPart =
    s.trendStrengthScore * 0.22 +
    s.liquidityQualityScore * 0.18 +
    s.historicalPatternQuality * 0.16 +
    s.eventEdgeScore * 0.08;
  const rrPart = (s.rewardRiskEstimate - 1) * 14;
  const riskPenalty = c.riskScore * 3.4;
  return Math.round(clamp(18 + confPart + signalPart + rrPart - riskPenalty, 5, 95));
}

function computeExpectedEdge(probabilityPct: number, rewardRiskEstimate: number): number {
  const p = probabilityPct / 100;
  return Number((p * rewardRiskEstimate - (1 - p)).toFixed(2));
}

function computeUncertainty(
  probabilityPct: number,
  liquidityScore: number,
  riskScore: number,
): CommanderUncertainty {
  if (probabilityPct >= 70 && liquidityScore >= 60 && riskScore <= 6) return "low";
  if (probabilityPct < 52 || liquidityScore < 45 || riskScore >= 7.8) return "high";
  return "moderate";
}

function buildTrail(
  c: StrategyCandidate | null,
  d: StrictDecisionRecord | null,
  probabilityPct: number,
  expectedEdge: number,
  signals: CommanderRawSignals,
): CommanderIdeaRow["reasoningTrail"] {
  const trail: CommanderIdeaRow["reasoningTrail"] = [];
  if (d?.sourcesUsed && Object.keys(d.sourcesUsed).length > 0) {
    trail.push({
      label: "Data sources used",
      detail: Object.entries(d.sourcesUsed)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · "),
      ok: true,
    });
  }
  if (d?.sourcesMissing?.length) {
    trail.push({
      label: "Required real data missing",
      detail: d.sourcesMissing.join(", "),
      ok: false,
    });
  }
  if (c?.facts?.provenance && typeof c.facts.provenance === "object") {
    const p = c.facts.provenance as Record<string, unknown>;
    trail.push({
      label: "Vendor provenance",
      detail: Object.entries(p)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(" · "),
      ok: true,
    });
  }
  trail.push({
    label: "Raw statistical signals",
    detail: `trend ${signals.trendStrengthScore.toFixed(0)} · liquidity ${signals.liquidityQualityScore.toFixed(0)} · pattern ${signals.historicalPatternQuality.toFixed(0)} · event ${signals.eventEdgeScore.toFixed(0)} · R/R ${signals.rewardRiskEstimate.toFixed(2)}`,
    ok: true,
  });
  trail.push({
    label: "Model inference",
    detail: `probability ${probabilityPct}% · expected edge ${expectedEdge.toFixed(2)} · confidence ${c?.confidence?.toFixed(1) ?? "0.0"} · risk ${c?.riskScore?.toFixed(1) ?? "0.0"}`,
    ok: true,
  });
  if (d?.decision === "TRADE") {
    trail.push({
      label: "Final AI judgment",
      detail: "Passed strict gates + OpenAI structured TRADE output.",
      ok: true,
    });
  } else if (d?.reasonCode) {
    trail.push({
      label: "Final AI judgment",
      detail: reasonLabel(d.reasonCode),
      ok: false,
    });
  }
  const rationale = c?.facts?.openaiRationale;
  if (typeof rationale === "string" && rationale.trim().length > 4) {
    trail.push({
      label: "OpenAI rationale (from scan)",
      detail: rationale.slice(0, 600) + (rationale.length > 600 ? "…" : ""),
      ok: true,
    });
  }
  return trail;
}

function applyProbabilityThresholds(
  confidence: number,
  stance: IdeaStance,
  probabilityPct: number,
  liquidityScore: number,
  prefs: CommanderPrefs,
): IdeaStance {
  if (stance !== "TRADE") return stance;
  if (confidence < prefs.minConfidenceScore) return "WATCH";
  if (probabilityPct < prefs.minProbabilityPct) return "WATCH";
  if (liquidityScore < prefs.minLiquidityScore) return "WATCH";
  return "TRADE";
}

function rowFromCandidate(
  c: StrategyCandidate,
  d: StrictDecisionRecord | null,
  prefs: CommanderPrefs,
  meta: ScannerSymbolMeta | undefined,
): CommanderIdeaRow {
  const source = resolveSource(meta);
  const signals = buildSignals(c);
  const probabilityPct = computeProbability(c, signals);
  const expectedEdge = computeExpectedEdge(probabilityPct, signals.rewardRiskEstimate);
  const uncertainty = computeUncertainty(probabilityPct, signals.liquidityQualityScore, c.riskScore);
  const rawStance = resolveStance(c, d);
  const stance = applyProbabilityThresholds(
    c.confidence,
    rawStance,
    probabilityPct,
    signals.liquidityQualityScore,
    prefs,
  );
  const bucket = assignBucket(c, stance, prefs);
  const standout =
    c.assetType === "OPTION"
      ? `${c.targetNote} · p=${probabilityPct}%`
      : `${c.strategyViewTag.replace(/_/g, " ")} · p=${probabilityPct}% · conf ${c.confidence.toFixed(1)}`;
  const tradeSummary = [
    `${c.symbol} ${c.assetType}`,
    stance,
    `p ${probabilityPct}%`,
    `edge ${expectedEdge.toFixed(2)}`,
    `conf ${c.confidence.toFixed(1)} risk ${c.riskScore.toFixed(1)}`,
    c.catalystSummary || c.thesis.slice(0, 120),
  ].join(" — ");

  return {
    symbol: c.symbol,
    assetType: c.assetType,
    category: c.strategyTag,
    strategyViewTag: c.strategyViewTag,
    bucket,
    stance,
    confidence: c.confidence,
    riskScore: c.riskScore,
    catalyst: c.catalystSummary,
    holdPeriod: c.holdingPeriodNote,
    standout,
    thesis: c.thesis,
    tradeSummary,
    source,
    isWatchlist: Boolean(meta?.inWatchlist),
    isPinned: Boolean(meta?.pinned),
    isHighPriority: Boolean(meta?.highPriority),
    isDiscovered: Boolean(meta?.inDiscovery && !meta?.inWatchlist),
    watchlists: meta?.watchlists ?? [],
    tags: meta?.tags ?? [],
    muted: meta?.muted ?? false,
    ignored: meta?.ignored ?? false,
    probabilityPct,
    expectedEdge,
    historicalPatternQuality: signals.historicalPatternQuality,
    trendStrengthScore: signals.trendStrengthScore,
    liquidityQualityScore: signals.liquidityQualityScore,
    eventEdgeScore: signals.eventEdgeScore,
    rewardRiskEstimate: signals.rewardRiskEstimate,
    uncertaintyLevel: uncertainty,
    suggestedWeightPct: 0,
    rawSignals: signals,
    modelInference: {
      confidence: c.confidence,
      riskScore: c.riskScore,
      expectedEdge,
      probabilityPct,
      uncertaintyLevel: uncertainty,
    },
    finalJudgment: {
      stance,
      suggestedWeightPct: 0,
      reason:
        stance === "TRADE"
          ? "Cleared probability/liquidity thresholds and strict decision gates."
          : "Did not fully clear probability/liquidity thresholds for deployable capital.",
    },
    candidate: c,
    decision: d,
    reasoningTrail: buildTrail(c, d, probabilityPct, expectedEdge, signals),
  };
}

function rowFromDecisionOnly(
  ticker: string,
  d: StrictDecisionRecord,
  meta: ScannerSymbolMeta | undefined,
): CommanderIdeaRow {
  const source = resolveSource(meta);
  const stance: IdeaStance = "NO_TRADE";
  const bucket: IdeaBucket = "avoid";
  const tradeSummary = `${ticker} — NO_TRADE — ${reasonLabel(d.reasonCode)}`;
  const signals: CommanderRawSignals = {
    trendStrengthScore: 0,
    liquidityQualityScore: 0,
    historicalPatternQuality: 0,
    eventEdgeScore: 0,
    rewardRiskEstimate: 0.5,
  };
  const probabilityPct = 0;
  const expectedEdge = -1;
  return {
    symbol: ticker,
    assetType: "STOCK",
    category: d.strategy,
    strategyViewTag: "rejected",
    bucket,
    stance,
    confidence: 0,
    riskScore: 0,
    catalyst: reasonLabel(d.reasonCode),
    holdPeriod: "—",
    standout: reasonLabel(d.reasonCode),
    thesis: d.sourcesMissing?.length
      ? `Missing: ${d.sourcesMissing.join(", ")}`
      : tradeSummary,
    tradeSummary,
    source,
    isWatchlist: Boolean(meta?.inWatchlist),
    isPinned: Boolean(meta?.pinned),
    isHighPriority: Boolean(meta?.highPriority),
    isDiscovered: Boolean(meta?.inDiscovery && !meta?.inWatchlist),
    watchlists: meta?.watchlists ?? [],
    tags: meta?.tags ?? [],
    muted: meta?.muted ?? false,
    ignored: meta?.ignored ?? false,
    probabilityPct,
    expectedEdge,
    historicalPatternQuality: 0,
    trendStrengthScore: 0,
    liquidityQualityScore: 0,
    eventEdgeScore: 0,
    rewardRiskEstimate: 0.5,
    uncertaintyLevel: "high",
    suggestedWeightPct: 0,
    rawSignals: signals,
    modelInference: {
      confidence: 0,
      riskScore: 0,
      expectedEdge,
      probabilityPct,
      uncertaintyLevel: "high",
    },
    finalJudgment: {
      stance,
      suggestedWeightPct: 0,
      reason: "Blocked by strict gate or required data missing.",
    },
    candidate: null,
    decision: d,
    reasoningTrail: buildTrail(null, d, probabilityPct, expectedEdge, signals),
  };
}

function adjustRank(row: CommanderIdeaRow, prefs: CommanderPrefs): number {
  const base = row.candidate?.rankScore ?? (row.stance === "TRADE" ? 50 : 0);
  let s = base;
  if (prefs.toggles.incomePriority && looksIncome(row)) s += 2.2;
  if (prefs.toggles.growthPriority && row.bucket === "aggressive_growth") s += 1.4;
  if (prefs.toggles.defensiveBias && row.strategyViewTag === "defensive_setup") s += 2;
  if (prefs.toggles.earningsFocus && row.candidate?.isEarningsPlay) s += 2;
  if (row.isWatchlist) s += prefs.watchlistPriorityBoost;
  if (row.isPinned || row.isHighPriority) s += prefs.watchlistPriorityBoost * 0.8;
  if (row.source === "watchlist_discovery_match") s += prefs.watchlistPriorityBoost * 0.5;
  return s + row.expectedEdge * 6 + row.probabilityPct * 0.03;
}

export function buildCommanderIdeas(snap: ScannerSnapshot | null, prefs: CommanderPrefs): CommanderIdeaRow[] {
  if (!snap) return [];

  const lastDecisionByTicker = new Map<string, StrictDecisionRecord>();
  for (const d of snap.decisions) {
    lastDecisionByTicker.set(d.ticker, d);
  }
  const metaBySymbol = new Map((snap.symbolMeta ?? []).map((m) => [m.symbol, m]));

  const rows: CommanderIdeaRow[] = [];
  const seen = new Set<string>();
  for (const c of snap.candidates) {
    const d = lastDecisionByTicker.get(c.symbol) ?? null;
    rows.push(rowFromCandidate(c, d, prefs, metaBySymbol.get(c.symbol)));
    seen.add(c.symbol);
  }

  for (const sym of snap.universe) {
    if (seen.has(sym)) continue;
    const d = lastDecisionByTicker.get(sym);
    if (d) rows.push(rowFromDecisionOnly(sym, d, metaBySymbol.get(sym)));
  }

  let filtered = rows.filter((r) => !r.ignored && !(r.muted && !r.isWatchlist));

  if (prefs.toggles.highConvictionOnly) {
    filtered = filtered.filter(
      (r) => r.stance === "TRADE" || r.probabilityPct >= 67 || r.bucket === "avoid",
    );
  }

  if (prefs.toggles.earningsFocus) {
    const anyE = filtered.some((r) => r.candidate?.isEarningsPlay);
    if (anyE) {
      filtered = filtered.filter(
        (r) => r.candidate?.isEarningsPlay || r.bucket === "avoid" || !r.candidate,
      );
    }
  }
  if (!prefs.toggles.optionsEnabled) filtered = filtered.filter((r) => r.assetType !== "OPTION");
  if (!prefs.toggles.stocksEnabled) filtered = filtered.filter((r) => r.assetType !== "STOCK");
  if (!prefs.toggles.earningsEnabled) {
    filtered = filtered.filter((r) => !r.candidate?.isEarningsPlay || r.bucket === "avoid");
  }

  filtered.sort((a, b) => adjustRank(b, prefs) - adjustRank(a, prefs));

  const allocationPlan = buildAllocationPlan(filtered, prefs, snap);
  const byAlloc = new Map(allocationPlan.ideas.map((r) => [r.symbol, r]));

  return filtered.map((row) => {
    const alloc = byAlloc.get(row.symbol);
    const nextWeight = alloc?.weightPct ?? 0;
    const reason =
      alloc?.reason ??
      (row.stance === "TRADE"
        ? "Qualified idea, but excluded by max positions/sector/position caps."
        : "Not deployable under current thresholds.");
    return {
      ...row,
      suggestedWeightPct: nextWeight,
      finalJudgment: {
        ...row.finalJudgment,
        suggestedWeightPct: nextWeight,
        reason,
      },
    };
  });
}

export function groupIdeasByBucket(rows: CommanderIdeaRow[]): Record<IdeaBucket, CommanderIdeaRow[]> {
  const empty: Record<IdeaBucket, CommanderIdeaRow[]> = {
    aggressive_growth: [],
    defensive: [],
    highest_income: [],
    options: [],
    crypto: [],
    watchlist_only: [],
    avoid: [],
  };
  for (const r of rows) empty[r.bucket].push(r);
  return empty;
}
