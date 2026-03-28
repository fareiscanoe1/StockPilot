import type { StrictDecisionRecord, StrategyCandidate } from "@/lib/engines/strategy-engine";

export type CommanderPrimaryMode =
  | "AGGRESSIVE_GROWTH"
  | "BALANCED"
  | "DEFENSIVE"
  | "HIGHEST_INCOME"
  | "OPTIONS_FOCUS"
  | "CRYPTO_FOCUS"
  | "EARNINGS_PLAYS"
  | "CUSTOM_MIX";

export type CommanderRiskLevel = "low" | "medium" | "high";

export type CommanderAllocation = {
  stocksPct: number;
  optionsPct: number;
  cryptoPct: number;
  cashPct: number;
};

export type CommanderToggles = {
  earningsFocus: boolean;
  highConvictionOnly: boolean;
  incomePriority: boolean;
  growthPriority: boolean;
  defensiveBias: boolean;
  cryptoEnabled: boolean;
  optionsEnabled: boolean;
};

export type CommanderPrefs = {
  primaryMode: CommanderPrimaryMode;
  riskLevel: CommanderRiskLevel;
  /** Background worker cadence for autonomous scans. */
  scanCadenceMin: 1 | 3 | 5 | 10;
  allocation: CommanderAllocation;
  toggles: CommanderToggles;
};

export type IdeaBucket =
  | "aggressive_growth"
  | "defensive"
  | "highest_income"
  | "options"
  | "crypto"
  | "watchlist_only"
  | "avoid";

export type IdeaStance = "TRADE" | "WATCH" | "NO_TRADE";

export type CommanderIdeaRow = {
  symbol: string;
  assetType: StrategyCandidate["assetType"];
  category: string;
  strategyViewTag: string;
  bucket: IdeaBucket;
  stance: IdeaStance;
  confidence: number;
  riskScore: number;
  catalyst: string;
  holdPeriod: string;
  standout: string;
  thesis: string;
  tradeSummary: string;
  candidate: StrategyCandidate | null;
  decision: StrictDecisionRecord | null;
  reasoningTrail: CommanderReasoningStep[];
};

export type CommanderReasoningStep = {
  label: string;
  detail: string;
  ok?: boolean;
};

export const DEFAULT_COMMANDER_PREFS: CommanderPrefs = {
  primaryMode: "BALANCED",
  riskLevel: "medium",
  scanCadenceMin: 3,
  allocation: {
    stocksPct: 55,
    optionsPct: 20,
    cryptoPct: 10,
    cashPct: 15,
  },
  toggles: {
    earningsFocus: false,
    highConvictionOnly: false,
    incomePriority: false,
    growthPriority: true,
    defensiveBias: false,
    cryptoEnabled: false,
    optionsEnabled: true,
  },
};
