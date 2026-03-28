import type { StrategyMode } from "@prisma/client";
import { defaultRiskForMode, type RiskParams } from "@/lib/engines/risk-params";
import {
  DEFAULT_COMMANDER_PREFS,
  type CommanderPrefs,
  type CommanderPrimaryMode,
  type CommanderRiskLevel,
} from "./types";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function normalizeCadence(v: unknown): CommanderPrefs["scanCadenceMin"] {
  const n = Number(v);
  if (n === 1 || n === 3 || n === 5 || n === 10) return n;
  return DEFAULT_COMMANDER_PREFS.scanCadenceMin;
}

export function strategyModeFromPrimary(primary: CommanderPrimaryMode): StrategyMode {
  switch (primary) {
    case "AGGRESSIVE_GROWTH":
      return "AGGRESSIVE";
    case "DEFENSIVE":
      return "DEFENSIVE";
    case "OPTIONS_FOCUS":
      return "OPTIONS_MOMENTUM";
    case "EARNINGS_PLAYS":
      return "EARNINGS_HUNTER";
    case "CUSTOM_MIX":
      return "CUSTOM";
    case "HIGHEST_INCOME":
    case "CRYPTO_FOCUS":
    case "BALANCED":
    default:
      return "BALANCED";
  }
}

export function primaryModeFromStrategyMode(mode: StrategyMode): CommanderPrimaryMode {
  switch (mode) {
    case "AGGRESSIVE":
      return "AGGRESSIVE_GROWTH";
    case "DEFENSIVE":
      return "DEFENSIVE";
    case "OPTIONS_MOMENTUM":
      return "OPTIONS_FOCUS";
    case "CUSTOM":
      return "CUSTOM_MIX";
    case "EARNINGS_HUNTER":
      return "EARNINGS_PLAYS";
    case "BALANCED":
    default:
      return "BALANCED";
  }
}

export function mergeRiskLevelIntoParams(
  mode: StrategyMode,
  riskLevel: CommanderRiskLevel,
  existingOverride?: unknown,
): RiskParams {
  const base = defaultRiskForMode(mode);
  const merged = {
    ...base,
    ...(existingOverride && typeof existingOverride === "object"
      ? (existingOverride as Partial<RiskParams>)
      : {}),
  };
  const f =
    riskLevel === "low" ? 0.82 : riskLevel === "high" ? 1.12 : 1;
  return {
    ...merged,
    maxPositionPct: clamp(Math.round(merged.maxPositionPct * f), 4, 22),
    maxPortfolioHeatPct: clamp(Math.round(merged.maxPortfolioHeatPct * f), 35, 92),
    maxBidAskSpreadPct: clamp(
      merged.maxBidAskSpreadPct * (riskLevel === "low" ? 0.9 : riskLevel === "high" ? 1.08 : 1),
      1.2,
      5,
    ),
    dailyMaxLossLockoutPct: clamp(
      merged.dailyMaxLossLockoutPct * (riskLevel === "low" ? 0.85 : riskLevel === "high" ? 1.15 : 1),
      1,
      10,
    ),
    weeklyMaxDrawdownLockoutPct: clamp(
      merged.weeklyMaxDrawdownLockoutPct * (riskLevel === "low" ? 0.88 : riskLevel === "high" ? 1.1 : 1),
      4,
      22,
    ),
    stockTrendMinScore: clamp(
      merged.stockTrendMinScore + (riskLevel === "low" ? 0.04 : riskLevel === "high" ? -0.03 : 0),
      0.38,
      0.62,
    ),
  };
}

type StoredCommander = Partial<CommanderPrefs> & { version?: number };

export function parseCommanderFromCustomRules(
  customRules: unknown,
  profileMode: StrategyMode,
): CommanderPrefs {
  const base = { ...DEFAULT_COMMANDER_PREFS };
  base.primaryMode = primaryModeFromStrategyMode(profileMode);

  if (!customRules || typeof customRules !== "object" || !("commander" in customRules)) {
    return applyModeSideEffects(base, profileMode);
  }
  const raw = (customRules as { commander?: StoredCommander }).commander;
  if (!raw || typeof raw !== "object") return applyModeSideEffects(base, profileMode);

  return applyModeSideEffects(
    {
      ...base,
      ...raw,
      scanCadenceMin: normalizeCadence(raw.scanCadenceMin),
      allocation: { ...base.allocation, ...raw.allocation },
      toggles: { ...base.toggles, ...raw.toggles },
    },
    profileMode,
  );
}

/** Align toggles with persisted strategy mode when commander block is partial. */
function applyModeSideEffects(prefs: CommanderPrefs, profileMode: StrategyMode): CommanderPrefs {
  const next = { ...prefs, toggles: { ...prefs.toggles } };
  if (profileMode === "EARNINGS_HUNTER") next.toggles.earningsFocus = true;
  return next;
}

export function buildCustomRulesWithCommander(
  prevCustom: unknown,
  prefs: CommanderPrefs,
): Record<string, unknown> {
  const prev =
    prevCustom && typeof prevCustom === "object" && !Array.isArray(prevCustom)
      ? { ...(prevCustom as Record<string, unknown>) }
      : {};
  prev.commander = { ...prefs, version: 1 };
  return prev;
}
