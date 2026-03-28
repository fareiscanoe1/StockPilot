import type { ScannerSnapshot } from "@/lib/queries/scanner-snapshot";
import type { CommanderIdeaRow, CommanderPrefs } from "./types";
import { strategyModeFromPrimary } from "./prefs";
import { buildAllocationPlan } from "./allocation";

function modePhrase(prefs: CommanderPrefs): string {
  const m = prefs.primaryMode;
  if (m === "DEFENSIVE") return "defensive quality and smaller size";
  if (m === "AGGRESSIVE_GROWTH") return "aggressive momentum and larger risk budget";
  if (m === "HIGHEST_INCOME") return "income-oriented ideas where the tape supports it";
  if (m === "OPTIONS_FOCUS") return "defined-risk options with liquidity gates";
  if (m === "CRYPTO_FOCUS") return "crypto setups when strict real-data quote/candle checks pass";
  if (m === "EARNINGS_PLAYS") return "earnings-window setups with strict calendar data";
  if (m === "CUSTOM_MIX") return "your custom mix";
  return "balanced swing setups";
}

export function buildExecutiveSummary(
  snap: ScannerSnapshot | null,
  ideas: CommanderIdeaRow[],
  prefs: CommanderPrefs,
): string {
  if (!snap) {
    return [
      "Market posture: awaiting first completed scan.",
      "Best opportunity: none yet (no real-data scan completed).",
      "Top risk: unknown until providers return data.",
      "Action: run or wait for auto-scan to complete.",
    ].join("\n");
  }

  const trades = ideas.filter((i) => i.stance === "TRADE");
  const watch = ideas.filter((i) => i.stance === "WATCH");
  const bestWatchlist = trades.find((i) => i.isWatchlist) ?? watch.find((i) => i.isWatchlist) ?? null;
  const bestNew =
    trades.find((i) => !i.isWatchlist && i.source !== "custom_universe") ??
    watch.find((i) => !i.isWatchlist && i.source !== "custom_universe") ??
    null;
  const blocked = snap.dataSources.warnings?.length
    ? ` Data-stack warnings: ${snap.dataSources.warnings.slice(0, 2).join("; ")}.`
    : "";

  const best = trades[0];
  const topSyms = trades.slice(0, 3).map((t) => t.symbol).join(", ");
  const riskLine =
    ideas.filter((i) => i.riskScore >= 7).length > 0
      ? `Elevated model risk scores on ${ideas.filter((i) => i.riskScore >= 7).length} name(s) — review invalidations.`
      : "No extreme risk scores flagged on ranked trade rows this pass.";

  const strat = strategyModeFromPrimary(prefs.primaryMode);
  const plan = buildAllocationPlan(ideas, prefs, snap);
  const alloc = `Allocator posture: ${plan.posture}. Suggested capital: ${plan.category.stocksPct}% stocks / ${plan.category.optionsPct}% options / ${plan.category.cryptoPct}% crypto / ${plan.category.cashPct}% cash.`;
  const edgeEnough =
    plan.ideas.length > 0 &&
    plan.ideas.reduce((s, i) => s + i.expectedEdge, 0) / Math.max(1, plan.ideas.length) > 0;

  const toggles: string[] = [];
  if (prefs.toggles.highConvictionOnly) toggles.push("high-conviction filter ON");
  if (prefs.toggles.earningsFocus) toggles.push("earnings focus ON");
  if (!prefs.toggles.optionsEnabled) toggles.push("options surface OFF");
  if (!prefs.toggles.cryptoEnabled) toggles.push("crypto excluded");
  const toggleStr = toggles.length ? ` ${toggles.join("; ")}.` : "";

  const openAi = snap.scanMeta.openAiInvocations;
  const passed = snap.scanMeta.passedToOpenAiGate;

  return [
    `Market posture (${strat}, ${prefs.riskLevel} risk): ${modePhrase(prefs)}.`,
    `Universe mode: ${prefs.universeMode.replace(/_/g, " ").toLowerCase()} · discovery size ${prefs.discoveryUniverseSize} · scanned ${snap.scanMeta.symbolsChecked}.`,
    `Coverage: ${snap.scanMeta.symbolsChecked} symbol(s), ${passed} passed gate, ${openAi} OpenAI call(s).`,
    trades.length
      ? `Best opportunities: ${topSyms || "—"}${best ? ` | Top: ${best.symbol} (${best.catalyst || best.thesis.slice(0, 80)})` : ""}.`
      : `Best opportunities: none cleared TRADE; ${watch.length} on WATCH, ${ideas.filter((i) => i.bucket === "avoid").length} avoid.`,
    `Best watchlist idea: ${bestWatchlist ? `${bestWatchlist.symbol} (p=${bestWatchlist.probabilityPct}%, edge=${bestWatchlist.expectedEdge.toFixed(2)})` : "none qualified"}.`,
    `Best newly discovered idea: ${bestNew ? `${bestNew.symbol} (p=${bestNew.probabilityPct}%, edge=${bestNew.expectedEdge.toFixed(2)})` : "none qualified outside watchlist"}.`,
    edgeEnough
      ? "Statistical edge appears sufficient to deploy selected risk budget now."
      : "Statistical edge is weak/uncertain; keep higher cash and wait for stronger setups.",
    `Risk pulse: ${riskLine}`,
    `${alloc}${toggleStr}${blocked}`,
    plan.explanation.slice(0, 2).join(" "),
  ].join("\n");
}
