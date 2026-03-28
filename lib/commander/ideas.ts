import type { ScannerSnapshot } from "@/lib/queries/scanner-snapshot";
import { REASON, type StrictDecisionRecord, type StrategyCandidate } from "@/lib/engines/strategy-engine";
import type { CommanderIdeaRow, CommanderPrefs, IdeaBucket, IdeaStance } from "./types";

const INCOME_RE = /\b(dividend|yield|income|covered call|premium|cash flow)\b/i;

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

function resolveStance(
  c: StrategyCandidate | null,
  d: StrictDecisionRecord | null,
): IdeaStance {
  if (!d) return c ? "TRADE" : "NO_TRADE";
  if (d.decision === "TRADE") return "TRADE";
  if (d.decision === "NO_TRADE") {
    if (d.reasonCode === REASON.OPENAI_DECISION_NO_TRADE && c && c.confidence >= 6) {
      return "WATCH";
    }
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
  if (stance === "TRADE" && prefs.toggles.incomePriority && c) return "highest_income";
  if (stance === "TRADE" && prefs.primaryMode === "DEFENSIVE") return "defensive";
  if (stance === "TRADE") return "aggressive_growth";
  return "avoid";
}

function buildTrail(
  c: StrategyCandidate | null,
  d: StrictDecisionRecord | null,
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
  if (d?.decision === "TRADE") {
    trail.push({
      label: "Gate outcome",
      detail: "Passed strict gates + OpenAI structured TRADE output.",
      ok: true,
    });
  } else if (d?.reasonCode) {
    trail.push({
      label: "Gate / model outcome",
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
  } else if (d?.reasonCode === REASON.OPENAI_REASONING_UNAVAILABLE) {
    trail.push({
      label: "OpenAI",
      detail: "Not called — reasoning layer unavailable.",
      ok: false,
    });
  } else if (d?.decision === "NO_TRADE" && d.reasonCode === REASON.OPENAI_DECISION_NO_TRADE) {
    const ntr = (d.provenance?.openaiNoTradeReason as string) ?? "";
    trail.push({
      label: "OpenAI conclusion",
      detail: ntr || "NO_TRADE (see engine log).",
      ok: false,
    });
  }
  if (c) {
    trail.push({
      label: "Rank score",
      detail: `rankScore=${(c.rankScore ?? 0).toFixed(2)} (liquidity, event edge, risk-adjusted).`,
      ok: true,
    });
  }
  return trail;
}

function rowFromCandidate(
  c: StrategyCandidate,
  d: StrictDecisionRecord | null,
  prefs: CommanderPrefs,
): CommanderIdeaRow {
  const stance = resolveStance(c, d);
  const standout =
    c.assetType === "OPTION"
      ? c.targetNote
      : `${c.strategyViewTag.replace(/_/g, " ")} · conf ${c.confidence.toFixed(1)}`;
  const tradeSummary = [
    `${c.symbol} ${c.assetType}`,
    stance,
    `conf ${c.confidence.toFixed(1)} risk ${c.riskScore.toFixed(1)}`,
    c.catalystSummary || c.thesis.slice(0, 120),
  ].join(" — ");

  const bucket = assignBucket(c, stance, prefs);

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
    candidate: c,
    decision: d,
    reasoningTrail: buildTrail(c, d),
  };
}

function rowFromDecisionOnly(ticker: string, d: StrictDecisionRecord): CommanderIdeaRow {
  const stance: IdeaStance = "NO_TRADE";
  const bucket: IdeaBucket = "avoid";
  const tradeSummary = `${ticker} — NO_TRADE — ${reasonLabel(d.reasonCode)}`;
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
    candidate: null,
    decision: d,
    reasoningTrail: buildTrail(null, d),
  };
}

function adjustRank(row: CommanderIdeaRow, prefs: CommanderPrefs): number {
  const base = row.candidate?.rankScore ?? (row.stance === "TRADE" ? 50 : 0);
  let s = base;
  if (prefs.toggles.incomePriority && looksIncome(row)) s += 2.2;
  if (prefs.toggles.growthPriority && row.bucket === "aggressive_growth") s += 1.4;
  if (prefs.toggles.defensiveBias && row.strategyViewTag === "defensive_setup") s += 2;
  if (prefs.toggles.earningsFocus && row.candidate?.isEarningsPlay) s += 2;
  return s;
}

export function buildCommanderIdeas(
  snap: ScannerSnapshot | null,
  prefs: CommanderPrefs,
): CommanderIdeaRow[] {
  if (!snap) return [];

  const lastDecisionByTicker = new Map<string, StrictDecisionRecord>();
  for (const d of snap.decisions) {
    lastDecisionByTicker.set(d.ticker, d);
  }

  const rows: CommanderIdeaRow[] = [];
  const seen = new Set<string>();

  for (const c of snap.candidates) {
    const d = lastDecisionByTicker.get(c.symbol) ?? null;
    rows.push(rowFromCandidate(c, d, prefs));
    seen.add(c.symbol);
  }

  for (const sym of snap.universe) {
    if (seen.has(sym)) continue;
    const d = lastDecisionByTicker.get(sym);
    if (d) rows.push(rowFromDecisionOnly(sym, d));
  }

  let filtered = rows;

  if (prefs.toggles.highConvictionOnly) {
    filtered = filtered.filter(
      (r) =>
        r.stance === "TRADE" ||
        (r.candidate != null && r.confidence >= 7) ||
        r.bucket === "avoid",
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

  if (!prefs.toggles.optionsEnabled) {
    filtered = filtered.filter((r) => r.assetType !== "OPTION");
  }

  filtered.sort((a, b) => adjustRank(b, prefs) - adjustRank(a, prefs));

  return filtered;
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
  for (const r of rows) {
    empty[r.bucket].push(r);
  }
  return empty;
}
