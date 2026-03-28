import type { StrategyMode } from "@prisma/client";

/** Example paper-trading strategy presets — tune via StrategySettings / `riskParams` JSON. */
export const exampleStrategies: {
  mode: StrategyMode;
  title: string;
  description: string;
  rules: string[];
}[] = [
  {
    mode: "EARNINGS_HUNTER",
    title: "Pre-earnings momentum (simulation)",
    description:
      "Bias toward names with scheduled earnings and supportive trend/volatility context. Uses adapter data; implied vs historical move requires vendor fields.",
    rules: [
      "Skip if spread or OI fails RiskEngine liquidity gates.",
      "Halve size inside 2 sessions of report if `allowHighEventRisk` is false in Defensive profile.",
      "Exit / trim on stop or time-based exit from scan config — not live order routing.",
    ],
  },
  {
    mode: "OPTIONS_MOMENTUM",
    title: "Liquid single-leg calls (mock chain friendly)",
    description:
      "Prioritizes tight spreads, OI, and volume from the Polygon options adapter. Spreads/straddles can be added as StrictStrategyEngine extensions.",
    rules: [
      "No simulated fill if mid-price spreadPct > profile max.",
      "Expiry selection: prefer 14–45 DTE in MOCK adapter outputs.",
    ],
  },
  {
    mode: "BALANCED",
    title: "Multi-factor swing (default)",
    description: "Blends technicals, event context, fundamentals snapshot, and news sentiment scores.",
    rules: [
      "Live desk uses OpenAI structured JSON over a vendor snapshot; see `lib/engines/openai-reasoning.ts`.",
      "Sector exposure caps enforced in RiskEngine parameters.",
    ],
  },
];
