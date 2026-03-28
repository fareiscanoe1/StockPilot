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

export type CommanderUniverseMode =
  | "WATCHLIST_ONLY"
  | "AI_DISCOVERY_ONLY"
  | "HYBRID"
  | "CUSTOM_UNIVERSE";

export type CommanderWatchCategoryTag =
  | "aggressive"
  | "defensive"
  | "income"
  | "options"
  | "crypto"
  | "earnings";

export type CommanderAllocation = {
  stocksPct: number;
  optionsPct: number;
  cryptoPct: number;
  cashPct: number;
};

export type CommanderToggles = {
  stocksEnabled: boolean;
  earningsEnabled: boolean;
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
  /** Universe composition policy used by scanner + commander. */
  universeMode: CommanderUniverseMode;
  /** Target count of discovery symbols before filters. */
  discoveryUniverseSize: 10 | 25 | 50 | 100;
  /** Background worker cadence for autonomous scans. */
  scanCadenceMin: 1 | 3 | 5 | 10;
  /** Priority boost added to watchlist names in ranking. */
  watchlistPriorityBoost: number;
  /** Allocation and risk controls for allocator outputs. */
  maxPositions: number;
  maxPositionWeightPct: number;
  maxSectorConcentrationPct: number;
  minProbabilityPct: number;
  minConfidenceScore: number;
  minLiquidityScore: number;
  cashFloorPct: number;
  /** Used when universeMode = CUSTOM_UNIVERSE. */
  customUniverseSymbols: string[];
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

export type CommanderIdeaSource =
  | "watchlist"
  | "pinned_watchlist"
  | "ai_discovered"
  | "watchlist_discovery_match"
  | "custom_universe"
  | "explicit_symbol";

export type CommanderUncertainty = "low" | "moderate" | "high";

export type CommanderRawSignals = {
  trendStrengthScore: number;
  liquidityQualityScore: number;
  historicalPatternQuality: number;
  eventEdgeScore: number;
  rewardRiskEstimate: number;
};

export type CommanderModelInference = {
  confidence: number;
  riskScore: number;
  expectedEdge: number;
  probabilityPct: number;
  uncertaintyLevel: CommanderUncertainty;
};

export type CommanderFinalJudgment = {
  stance: IdeaStance;
  suggestedWeightPct: number;
  reason: string;
};

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
  source: CommanderIdeaSource;
  isWatchlist: boolean;
  isPinned: boolean;
  isHighPriority: boolean;
  isDiscovered: boolean;
  watchlists: string[];
  tags: CommanderWatchCategoryTag[];
  muted: boolean;
  ignored: boolean;
  probabilityPct: number;
  expectedEdge: number;
  historicalPatternQuality: number;
  trendStrengthScore: number;
  liquidityQualityScore: number;
  eventEdgeScore: number;
  rewardRiskEstimate: number;
  uncertaintyLevel: CommanderUncertainty;
  suggestedWeightPct: number;
  rawSignals: CommanderRawSignals;
  modelInference: CommanderModelInference;
  finalJudgment: CommanderFinalJudgment;
  candidate: StrategyCandidate | null;
  decision: StrictDecisionRecord | null;
  reasoningTrail: CommanderReasoningStep[];
};

export type CommanderReasoningStep = {
  label: string;
  detail: string;
  ok?: boolean;
};

export type CommanderAllocationPosture =
  | "risk-on"
  | "balanced"
  | "defensive"
  | "high-income"
  | "opportunistic";

export type CommanderCategoryAllocation = {
  stocksPct: number;
  optionsPct: number;
  cryptoPct: number;
  cashPct: number;
};

export type CommanderIdeaAllocation = {
  symbol: string;
  source: CommanderIdeaSource;
  stance: IdeaStance;
  probabilityPct: number;
  confidence: number;
  expectedEdge: number;
  weightPct: number;
  reason: string;
};

export type CommanderAllocationPlan = {
  posture: CommanderAllocationPosture;
  category: CommanderCategoryAllocation;
  ideas: CommanderIdeaAllocation[];
  explanation: string[];
};

export const DEFAULT_COMMANDER_PREFS: CommanderPrefs = {
  primaryMode: "BALANCED",
  riskLevel: "medium",
  universeMode: "HYBRID",
  discoveryUniverseSize: 25,
  scanCadenceMin: 3,
  watchlistPriorityBoost: 1.5,
  maxPositions: 8,
  maxPositionWeightPct: 20,
  maxSectorConcentrationPct: 35,
  minProbabilityPct: 55,
  minConfidenceScore: 6,
  minLiquidityScore: 45,
  cashFloorPct: 15,
  customUniverseSymbols: [],
  allocation: {
    stocksPct: 55,
    optionsPct: 20,
    cryptoPct: 10,
    cashPct: 15,
  },
  toggles: {
    stocksEnabled: true,
    earningsEnabled: true,
    earningsFocus: false,
    highConvictionOnly: false,
    incomePriority: false,
    growthPriority: true,
    defensiveBias: false,
    cryptoEnabled: false,
    optionsEnabled: true,
  },
};
