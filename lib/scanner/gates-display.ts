import type { StrategyMode } from "@prisma/client";
import type { ReasonCode, StrictDecisionRecord, StrategyCandidate } from "@/lib/engines/strategy-engine";
import { REASON } from "@/lib/engines/strategy-engine";

export type GateChipState = "pass" | "fail" | "na";

export interface GateChip {
  id: string;
  label: string;
  state: GateChipState;
  title?: string;
}

/** Compact chips for symbols that became TRADE candidates (gates were satisfied). */
export function passedGateChips(
  candidate: StrategyCandidate,
  mode: StrategyMode,
): GateChip[] {
  const facts = candidate.facts as Record<string, unknown>;
  const volOk = typeof facts.volume === "number" && facts.volume > 0;
  const nbbo = facts.underlyingNbboObserved === true;
  const p = facts.provenance as Record<string, string | null> | undefined;

  const chips: GateChip[] = [
    {
      id: "trend",
      label: "Trend",
      state: "pass",
      title: "Trend confirmation gate passed before AI.",
    },
    {
      id: "vol",
      label: "Vol",
      state: volOk ? "pass" : "fail",
      title: volOk ? "Real volume observed" : "Volume missing",
    },
  ];

  if (mode === "EARNINGS_HUNTER") {
    chips.push({
      id: "earn",
      label: "Ern",
      state: candidate.isEarningsPlay ? "pass" : "fail",
      title: candidate.isEarningsPlay
        ? "Earnings window / proximity OK"
        : "Earnings hunter gate not satisfied for this name",
    });
  } else {
    chips.push({
      id: "earn",
      label: "Ern",
      state: candidate.isEarningsPlay ? "pass" : "na",
      title: candidate.isEarningsPlay
        ? "Earnings event in context"
        : "Not an earnings-window play in this mode",
    });
  }

  if (candidate.assetType === "OPTION") {
    const opt = p?.optionsChain === "POLYGON";
    chips.push({
      id: "opt",
      label: "Opt",
      state: opt ? "pass" : "fail",
      title: opt ? "Polygon chain + liquidity filters passed" : "Options liquidity / chain issue",
    });
  } else {
    chips.push({
      id: "opt",
      label: "Opt",
      state: "na",
      title: "Stock mode — options gate not applied",
    });
  }

  chips.push({
    id: "nbbo",
    label: nbbo ? "NBBO" : "NBBO*",
    state: nbbo ? "pass" : "na",
    title: nbbo
      ? "Underlying NBBO observed"
      : "NBBO not observed — last / volume-only context",
  });

  return chips;
}

const REJECT_MAP: Partial<Record<ReasonCode, string>> = {
  [REASON.STOCK_TREND_RULE_FAIL]: "Trend",
  [REASON.STOCK_LIQUIDITY_RULE_FAIL]: "Liquidity",
  [REASON.EARNINGS_PROXIMITY_FAIL]: "Earnings proximity",
  [REASON.EARNINGS_DATE_UNAVAILABLE_FOR_SYMBOL]: "Earnings proximity",
  [REASON.EARNINGS_ADAPTER_MISSING]: "Earnings proximity",
  [REASON.OPTIONS_CHAIN_UNAVAILABLE]: "Options liq.",
  [REASON.OPTIONS_CONTRACT_NBBO_MISSING]: "Options liq.",
  [REASON.OPTIONS_NO_QUALIFYING_STRIKE]: "Options liq.",
  [REASON.OPTIONS_MODULE_DISABLED_NO_POLYGON]: "Options liq.",
  [REASON.OPENAI_DECISION_NO_TRADE]: "OpenAI no-trade",
  [REASON.OPENAI_REASONING_FAILED]: "OpenAI fail",
  [REASON.OPENAI_REASONING_UNAVAILABLE]: "OpenAI off",
};

/** Compact rejection chips for NO_TRADE rows. */
export function rejectedByChips(d: StrictDecisionRecord): { labels: string[]; title: string } {
  if (d.decision === "TRADE" || !d.reasonCode) {
    return { labels: [], title: "" };
  }

  const labels: string[] = [];
  const base = REJECT_MAP[d.reasonCode];
  if (base) labels.push(base);

  const ntr = (d.provenance.openaiNoTradeReason as string | null) ?? "";
  const low =
    /\b(confidence|score|conviction|low)\b/i.test(ntr) && d.reasonCode === REASON.OPENAI_DECISION_NO_TRADE;
  if (low) labels.push("Confidence");

  if (d.reasonCode === REASON.MISSING_STOCK_VOLUME) labels.push("Volume");
  if (d.reasonCode === REASON.POSITION_SIZE_RULE_FAIL) labels.push("Size");

  const uniq = [...new Set(labels)];
  return {
    labels: uniq.length ? uniq : [d.reasonCode.replace(/_/g, " ").slice(0, 22)],
    title: d.reasonCode ?? "",
  };
}
