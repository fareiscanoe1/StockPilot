"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DataStackSummary } from "@/lib/adapters/provider-factory";
import type { EarningsCacheRow } from "@/lib/serializers/earnings-cache";
import { useLiveDesk } from "@/components/live-scan/useLiveDesk";
import { buildCommanderIdeas, groupIdeasByBucket } from "@/lib/commander/ideas";
import { buildExecutiveSummary } from "@/lib/commander/summary";
import { buildScanDigest } from "@/lib/commander/digest";
import { formatRealDataLabel, panelRealDataStatus } from "@/lib/commander/data-status";
import { providerHealthFromScan } from "@/lib/scanner/provider-health";
import type { ScannerSnapshot } from "@/lib/queries/scanner-snapshot";
import type {
  CommanderCommentaryRow,
  CommanderDeskHeartbeat,
  CommanderFeedEvent,
  CommanderScanHistoryRow,
} from "@/lib/commander/operator-types";
import {
  buildCustomRulesWithCommander,
  mergeRiskLevelIntoParams,
  strategyModeFromPrimary,
} from "@/lib/commander/prefs";
import {
  DEFAULT_COMMANDER_PREFS,
  type CommanderIdeaRow,
  type CommanderPrefs,
  type CommanderPrimaryMode,
} from "@/lib/commander/types";
import Link from "next/link";

const TABS = [
  "overview",
  "opportunities",
  "options",
  "crypto",
  "earnings",
  "portfolio",
  "ai",
  "risk",
  "settings",
] as const;

type TabId = (typeof TABS)[number];

type Props = {
  initialCommanderPrefs: CommanderPrefs;
  initialCustomRules: unknown;
  initialRiskParams: unknown;
  notificationPrefs: {
    minTradeAlertConfidence: number | null;
    alertsHighConvictionOnly: boolean;
  };
  portfolio: { accountCount: number; totalEquity: number; openLots: number };
  virtualAccounts: Array<{
    id: string;
    name: string;
    subPortfolio: string;
    startingCash: number;
    cashBalance: number;
  }>;
  alerts: Array<{ id: string; title: string; body: string; createdAt: string }>;
  earnings: EarningsCacheRow[];
  watchlist: string[];
  watchQuotes: Array<{ symbol: string; last: number | null }>;
  watchTrends: Array<{
    symbol: string;
    source: string;
    blockedReason?: string;
    bars: Array<{ t: string; c: number; v: number }>;
  }>;
  liveNews: Array<{
    id: string;
    symbol: string | null;
    headline: string;
    source: string;
    url: string | null;
    publishedAt: string | null;
  }>;
  dataStack: DataStackSummary;
  initialDeskHeartbeat: CommanderDeskHeartbeat;
  initialScanHistory: CommanderScanHistoryRow[];
  initialOperatorCommentary: CommanderCommentaryRow[];
};

const PRIMARY_OPTIONS: { value: CommanderPrimaryMode; label: string }[] = [
  { value: "AGGRESSIVE_GROWTH", label: "Aggressive" },
  { value: "BALANCED", label: "Balanced" },
  { value: "DEFENSIVE", label: "Defensive" },
  { value: "HIGHEST_INCOME", label: "Highest income" },
  { value: "OPTIONS_FOCUS", label: "Options focus" },
  { value: "CRYPTO_FOCUS", label: "Crypto focus" },
  { value: "EARNINGS_PLAYS", label: "Earnings plays" },
  { value: "CUSTOM_MIX", label: "Custom mix" },
];

function tabCls(active: boolean) {
  return `rounded-md px-3 py-1.5 text-xs font-medium transition ${
    active ? "bg-[var(--accent-dim)] text-white" : "text-[var(--muted)] hover:bg-white/5"
  }`;
}

type SourceLine = {
  label: string;
  value: string;
  href?: string;
  blocked?: boolean;
};

function sourceLinesForIdea(row: CommanderIdeaRow): SourceLine[] {
  const lines: SourceLine[] = [];
  const add = (line: SourceLine) => {
    if (!line.value.trim()) return;
    const dupe = lines.some(
      (x) => x.label === line.label && x.value === line.value && x.href === line.href,
    );
    if (!dupe) lines.push(line);
  };

  const used = row.decision?.sourcesUsed;
  if (used) {
    Object.entries(used).forEach(([k, v]) => add({ label: `Used: ${k}`, value: String(v) }));
  }
  (row.decision?.sourcesMissing ?? []).forEach((m) =>
    add({
      label: "Missing requirement",
      value: m,
      blocked: true,
    }),
  );

  if (row.candidate?.facts?.provenance && typeof row.candidate.facts.provenance === "object") {
    Object.entries(row.candidate.facts.provenance as Record<string, unknown>).forEach(([k, v]) =>
      add({ label: `Provenance: ${k}`, value: String(v) }),
    );
  }

  const web = row.candidate?.facts?.webResearchOpenWebOnly;
  if (web && typeof web === "object") {
    const wr = web as { titles?: unknown; urls?: unknown };
    const titles = Array.isArray(wr.titles) ? wr.titles : [];
    const urls = Array.isArray(wr.urls) ? wr.urls : [];
    urls.forEach((u, i) => {
      if (typeof u !== "string" || !u) return;
      const title = typeof titles[i] === "string" && titles[i] ? titles[i] : `Web source ${i + 1}`;
      add({ label: title, value: u, href: u });
    });
  }

  if (!lines.length) {
    add({
      label: "Sources",
      value: "No source metadata available for this row.",
      blocked: row.stance !== "TRADE",
    });
  }
  return lines;
}

function sparkPath(values: number[], width = 150, height = 42): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-9, max - min);
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / span) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

type CommandTraceStep = {
  label: string;
  status: "running" | "done" | "blocked" | "failed";
  detail: string;
};

function modeLabel(m: CommanderPrimaryMode): string {
  return m.replace(/_/g, " ").toLowerCase();
}

function summarizePrefsShift(prev: CommanderPrefs, next: CommanderPrefs): string | null {
  const notes: string[] = [];
  if (prev.primaryMode !== next.primaryMode) {
    notes.push(`mode ${modeLabel(prev.primaryMode)} -> ${modeLabel(next.primaryMode)}`);
  }
  if (prev.riskLevel !== next.riskLevel) {
    notes.push(`risk ${prev.riskLevel} -> ${next.riskLevel}`);
  }
  if (prev.scanCadenceMin !== next.scanCadenceMin) {
    notes.push(`background cadence ${prev.scanCadenceMin}m -> ${next.scanCadenceMin}m`);
  }
  if (prev.toggles.cryptoEnabled !== next.toggles.cryptoEnabled) {
    notes.push(next.toggles.cryptoEnabled ? "crypto enabled" : "crypto disabled");
  }
  if (prev.toggles.optionsEnabled !== next.toggles.optionsEnabled) {
    notes.push(next.toggles.optionsEnabled ? "options enabled" : "options disabled");
  }
  if (prev.toggles.highConvictionOnly !== next.toggles.highConvictionOnly) {
    notes.push(
      next.toggles.highConvictionOnly
        ? "high-conviction filter ON"
        : "high-conviction filter OFF",
    );
  }
  if (prev.toggles.defensiveBias !== next.toggles.defensiveBias) {
    notes.push(next.toggles.defensiveBias ? "defensive bias ON" : "defensive bias OFF");
  }
  if (prev.toggles.incomePriority !== next.toggles.incomePriority) {
    notes.push(next.toggles.incomePriority ? "income priority ON" : "income priority OFF");
  }
  return notes.length ? `Strategy posture changed: ${notes.join("; ")}.` : null;
}

function scanDeltaNarration(
  prevSnap: ScannerSnapshot | null,
  currentSnap: ScannerSnapshot,
  prefs: CommanderPrefs,
): {
  headline: string;
  commentaryLines: string[];
} {
  if (!prevSnap) {
    return {
      headline: "Initial live baseline captured.",
      commentaryLines: [
        `Scanning in ${modeLabel(prefs.primaryMode)} posture at ${prefs.riskLevel} risk.`,
      ],
    };
  }
  const prevIdeas = buildCommanderIdeas(prevSnap, prefs);
  const currIdeas = buildCommanderIdeas(currentSnap, prefs);
  const prevTrade = new Set(prevIdeas.filter((i) => i.stance === "TRADE").map((i) => i.symbol));
  const currTrade = new Set(currIdeas.filter((i) => i.stance === "TRADE").map((i) => i.symbol));
  const prevWatch = new Set(prevIdeas.filter((i) => i.stance === "WATCH").map((i) => i.symbol));
  const currWatch = new Set(currIdeas.filter((i) => i.stance === "WATCH").map((i) => i.symbol));

  const upgrades = [...currTrade].filter((s) => !prevTrade.has(s));
  const downgrades = [...prevTrade].filter((s) => !currTrade.has(s));
  const newWatch = [...currWatch].filter((s) => !prevWatch.has(s) && !currTrade.has(s));

  const lines: string[] = [];
  if (upgrades.length) lines.push(`Upgraded to TRADE: ${upgrades.slice(0, 3).join(", ")}.`);
  if (downgrades.length) lines.push(`Downgraded from TRADE: ${downgrades.slice(0, 3).join(", ")}.`);
  if (newWatch.length) lines.push(`Moved to WATCH: ${newWatch.slice(0, 3).join(", ")}.`);
  if (!lines.length) lines.push("No major rank-state change vs previous scan.");

  const reasonDiff = (() => {
    const prevMap = new Map(prevSnap.decisions.map((d) => [d.ticker, d.reasonCode ?? "TRADE"]));
    const currMap = new Map(
      currentSnap.decisions.map((d) => [d.ticker, d.reasonCode ?? "TRADE"]),
    );
    const changed: string[] = [];
    for (const [sym, rc] of currMap.entries()) {
      const p = prevMap.get(sym);
      if (p != null && p !== rc) changed.push(`${sym}: ${p} -> ${rc}`);
    }
    return changed.slice(0, 3);
  })();
  if (reasonDiff.length) lines.push(`Decision reason changes: ${reasonDiff.join("; ")}`);

  return {
    headline:
      upgrades.length || downgrades.length
        ? `${upgrades.length} upgraded, ${downgrades.length} downgraded since last scan.`
        : "Market state mostly unchanged since last scan.",
    commentaryLines: lines,
  };
}

export function CommanderClient({
  initialCommanderPrefs,
  initialCustomRules,
  initialRiskParams,
  notificationPrefs,
  portfolio,
  virtualAccounts,
  alerts,
  earnings,
  watchlist,
  watchQuotes,
  watchTrends,
  liveNews,
  dataStack,
  initialDeskHeartbeat,
  initialScanHistory,
  initialOperatorCommentary,
}: Props) {
  const desk = useLiveDesk();
  const runScan = desk.runScan;
  const [tab, setTab] = useState<TabId>("overview");
  const [prefs, setPrefs] = useState<CommanderPrefs>(initialCommanderPrefs);
  const customRulesRef = useRef(initialCustomRules);
  const [saving, setSaving] = useState(false);
  const [executiveHeuristic, setExecutiveHeuristic] = useState("");
  const [executiveAi, setExecutiveAi] = useState<string | null>(null);
  const [narrateBusy, setNarrateBusy] = useState(false);
  const [chat, setChat] = useState<Array<{ role: "user" | "assistant"; text: string }>>([
    {
      role: "assistant",
      text: "I'm your Portfolio Commander. I narrate each scan, surface strict real-data opportunities, and respect your risk sliders. Start a scan or adjust strategy — I'll update the desk live.",
    },
  ]);
  const [commandInput, setCommandInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [commandTrace, setCommandTrace] = useState<CommandTraceStep[]>([]);
  const [expandedIdea, setExpandedIdea] = useState<string | null>(null);
  const [sourceIdea, setSourceIdea] = useState<CommanderIdeaRow | null>(null);
  const [accountRows, setAccountRows] = useState(virtualAccounts);
  const [cashSetDraft, setCashSetDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(virtualAccounts.map((a) => [a.id, a.cashBalance.toFixed(2)])),
  );
  const [cashDeltaDraft, setCashDeltaDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(virtualAccounts.map((a) => [a.id, "0"])),
  );
  const [accountBusy, setAccountBusy] = useState<string | null>(null);
  const [localCommentary, setLocalCommentary] = useState<string[]>([]);
  const [deskHeartbeat, setDeskHeartbeat] = useState<CommanderDeskHeartbeat>(
    initialDeskHeartbeat,
  );
  const [scanHistory, setScanHistory] = useState<CommanderScanHistoryRow[]>(initialScanHistory);
  const [operatorCommentary, setOperatorCommentary] = useState<CommanderCommentaryRow[]>(
    initialOperatorCommentary,
  );
  const [feedConnected, setFeedConnected] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [lastScanDelta, setLastScanDelta] = useState<string>("Waiting for first completed scan…");
  const scanNarrationRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCompletedRef = useRef<string | null>(null);
  const skipPrefsAutosave = useRef(true);
  const prevPrefsRef = useRef(initialCommanderPrefs);
  const prevSnapshotRef = useRef<ScannerSnapshot | null>(null);

  const ideas = useMemo(
    () => buildCommanderIdeas(desk.lastSnapshot, prefs),
    [desk.lastSnapshot, prefs],
  );
  const buckets = useMemo(() => groupIdeasByBucket(ideas), [ideas]);

  const marketStatus = panelRealDataStatus(desk.lastSnapshot?.dataSources ?? dataStack, "market");
  const optionsStatus = panelRealDataStatus(desk.lastSnapshot?.dataSources ?? dataStack, "options");
  const earnStatus = panelRealDataStatus(desk.lastSnapshot?.dataSources ?? dataStack, "earnings");
  const reasoningStatus = panelRealDataStatus(
    desk.lastSnapshot?.dataSources ?? dataStack,
    "reasoning",
  );
  const cryptoStatus = panelRealDataStatus(
    desk.lastSnapshot?.dataSources ?? dataStack,
    "crypto",
  );

  const providerHealth = useMemo(() => {
    if (desk.lastSnapshot) {
      return providerHealthFromScan(
        desk.lastSnapshot,
        desk.metrics,
        desk.lastSnapshot.decisions,
      );
    }
    return [
      {
        id: "polygon" as const,
        label: "Polygon",
        status: optionsStatus.status === "real" ? ("ok" as const) : ("failed" as const),
        detail: optionsStatus.detail,
      },
      {
        id: "finnhub" as const,
        label: "Finnhub / market",
        status: marketStatus.status === "real" ? ("ok" as const) : ("failed" as const),
        detail: marketStatus.detail,
      },
      {
        id: "openai" as const,
        label: "OpenAI",
        status: reasoningStatus.status === "real" ? ("ok" as const) : ("failed" as const),
        detail: reasoningStatus.detail,
      },
    ];
  }, [desk.lastSnapshot, desk.metrics, optionsStatus, marketStatus, reasoningStatus]);

  const rejectReasonCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of desk.lastSnapshot?.decisions ?? []) {
      if (d.decision !== "NO_TRADE") continue;
      const k = d.reasonCode ?? "UNKNOWN";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [desk.lastSnapshot]);

  const persistCommentary = useCallback(
    async (
      kind: CommanderCommentaryRow["kind"],
      eventType: string,
      message: string,
      payload?: unknown,
    ) => {
      try {
        await fetch("/api/commander/commentary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, eventType, message, payload }),
        });
      } catch {
        // Ignore persist failures; keep local UX responsive.
      }
    },
    [],
  );

  const addLocalCommentary = useCallback(
    (
      message: string,
      opts?: {
        kind?: CommanderCommentaryRow["kind"];
        eventType?: string;
        payload?: unknown;
      },
    ) => {
      const line = `${new Date().toLocaleTimeString()} — ${message}`;
      setLocalCommentary((c) => [...c, line]);
      void persistCommentary(
        opts?.kind ?? "SYSTEM",
        opts?.eventType ?? "ui_note",
        line,
        opts?.payload,
      );
    },
    [persistCommentary],
  );

  const persistStrategy = useCallback(async () => {
    const mode = strategyModeFromPrimary(prefs.primaryMode);
    const riskParams = mergeRiskLevelIntoParams(mode, prefs.riskLevel, initialRiskParams);
    const customRules = buildCustomRulesWithCommander(customRulesRef.current, prefs);
    setSaving(true);
    try {
      const res = await fetch("/api/strategy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, riskParams, customRules }),
      });
      if (!res.ok) throw new Error("Save failed");
      const j = (await res.json()) as { profile?: { customRules?: unknown } };
      if (j.profile?.customRules !== undefined) customRulesRef.current = j.profile.customRules;
      return true;
    } catch {
      addLocalCommentary("Strategy save failed (network or server).", {
        kind: "RISK_ALERT",
        eventType: "strategy_save_failed",
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [addLocalCommentary, prefs, initialRiskParams]);

  const applyAndRescan = useCallback(async () => {
    const ok = await persistStrategy();
    if (ok) {
      addLocalCommentary("Strategy saved; re-running universe scan…", {
        kind: "STRATEGY_SHIFT",
        eventType: "apply_and_rescan",
      });
      await runScan();
    }
  }, [addLocalCommentary, persistStrategy, runScan]);

  useEffect(() => {
    const t = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    setAccountRows(virtualAccounts);
    setCashSetDraft((prev) => {
      const next = { ...prev };
      for (const a of virtualAccounts) {
        if (!(a.id in next)) next[a.id] = a.cashBalance.toFixed(2);
      }
      return next;
    });
    setCashDeltaDraft((prev) => {
      const next = { ...prev };
      for (const a of virtualAccounts) {
        if (!(a.id in next)) next[a.id] = "0";
      }
      return next;
    });
  }, [virtualAccounts]);

  useEffect(() => {
    void runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial desk load only
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/commander/feed");
    setFeedConnected(true);
    es.onopen = () => setFeedConnected(true);
    es.onerror = () => setFeedConnected(false);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as CommanderFeedEvent;
        if (!data || typeof data !== "object" || !("type" in data)) return;
        if (data.type === "hello") {
          setDeskHeartbeat(data.heartbeat);
          setScanHistory(data.runs);
          setOperatorCommentary(data.commentary);
          if (data.runs[0]?.whatChanged) setLastScanDelta(data.runs[0].whatChanged);
          if (data.runs[0]?.summaryText) setExecutiveHeuristic(data.runs[0].summaryText);
          return;
        }
        if (data.type === "heartbeat") {
          setDeskHeartbeat(data.heartbeat);
          return;
        }
        if (data.type === "scan_run") {
          setScanHistory((prev) => {
            const next = [data.run, ...prev.filter((r) => r.id !== data.run.id)];
            return next.sort((a, b) => +new Date(b.completedAt) - +new Date(a.completedAt)).slice(0, 40);
          });
          if (data.run.whatChanged) setLastScanDelta(data.run.whatChanged);
          if (data.run.summaryText) setExecutiveHeuristic(data.run.summaryText);
          return;
        }
        if (data.type === "commentary") {
          setOperatorCommentary((prev) => {
            const next = [data.commentary, ...prev.filter((c) => c.id !== data.commentary.id)];
            return next
              .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
              .slice(0, 220);
          });
          return;
        }
      } catch {
        setFeedConnected(false);
      }
    };
    return () => {
      es.close();
    };
  }, []);

  useEffect(() => {
    const prev = prevPrefsRef.current;
    const note = summarizePrefsShift(prev, prefs);
    if (note && prev !== prefs) {
      addLocalCommentary(note, {
        kind: "STRATEGY_SHIFT",
        eventType: "prefs_changed",
      });
      setChat((c) => [
        ...c,
        {
          role: "assistant",
          text: `${note} Re-scanning and re-ranking opportunities for your updated style.`,
        },
      ]);
    }
    prevPrefsRef.current = prefs;
  }, [addLocalCommentary, prefs]);

  useEffect(() => {
    if (skipPrefsAutosave.current) {
      skipPrefsAutosave.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void (async () => {
        const ok = await persistStrategy();
        if (ok) {
          addLocalCommentary("Preferences synced; scanning with updated profile…", {
            kind: "STRATEGY_SHIFT",
            eventType: "prefs_synced",
          });
          await runScan();
        }
      })();
    }, 450);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [addLocalCommentary, prefs, persistStrategy, runScan]);

  useEffect(() => {
    if (desk.scanning && !scanNarrationRef.current) {
      scanNarrationRef.current = true;
      const u = desk.lastSnapshot?.universe?.length ?? watchlist.length;
      setChat((c) => [
        ...c,
        {
          role: "assistant",
          text: `I'm scanning ${u || "your"} universe symbol(s) with ${prefs.primaryMode.replace(/_/g, " ").toLowerCase()} posture and ${prefs.riskLevel} risk. Watching liquidity, earnings window, and OpenAI gates…`,
        },
      ]);
      addLocalCommentary(
        `Live desk: scan started (${strategyModeFromPrimary(prefs.primaryMode)} / ${prefs.riskLevel}).`,
        { kind: "SYSTEM", eventType: "live_scan_started" },
      );
    }
    if (!desk.scanning) scanNarrationRef.current = false;
  }, [
    addLocalCommentary,
    desk.scanning,
    desk.lastSnapshot?.universe,
    prefs.primaryMode,
    prefs.riskLevel,
    watchlist.length,
  ]);

  useEffect(() => {
    if (!desk.lastSnapshot || desk.scanning) return;
    const h = buildExecutiveSummary(desk.lastSnapshot, ideas, prefs);
    setExecutiveHeuristic(h);
  }, [desk.lastSnapshot, desk.scanning, ideas, prefs]);

  useEffect(() => {
    if (!desk.lastCompletedAt || desk.scanning) return;
    if (lastCompletedRef.current === desk.lastCompletedAt) return;
    lastCompletedRef.current = desk.lastCompletedAt;

    const snap = desk.lastSnapshot;
    if (!snap) return;

    const digest = buildScanDigest(snap);
    const ideaList = buildCommanderIdeas(snap, prefs);
    const heuristic = buildExecutiveSummary(snap, ideaList, prefs);
    const trades = ideaList.filter((i) => i.stance === "TRADE").length;
    const watch = ideaList.filter((i) => i.stance === "WATCH").length;
    const grouped = groupIdeasByBucket(ideaList);
    const strongestBucketRows: Array<[string, number]> = [
      ["best overall", ideaList.length],
      ["aggressive", grouped.aggressive_growth.length],
      ["defensive", grouped.defensive.length],
      ["income", grouped.highest_income.length],
      ["options", grouped.options.length],
      ["crypto", grouped.crypto.length],
    ];
    const strongestBucket = strongestBucketRows.sort((a, b) => b[1] - a[1])[0]?.[0];
    const delta = scanDeltaNarration(prevSnapshotRef.current, snap, prefs);
    setLastScanDelta(delta.headline);

    setChat((c) => [
      ...c,
      {
        role: "assistant",
        text: `Scan complete: ${trades} TRADE row(s), ${watch} on watch, ${snap.scanMeta.symbolsChecked} symbols checked. Strongest board: ${strongestBucket ?? "n/a"}. ${delta.headline} ${trades ? `Top focus: ${ideaList.find((i) => i.stance === "TRADE")?.symbol ?? "—"}.` : "No trades cleared — check spreads, trend gates, or OpenAI no-trade reasons."}`,
      },
    ]);

    addLocalCommentary(
      `Desk: ${snap.scanMeta.tradeDecisionCount} engine trade decision(s); OpenAI calls ${snap.scanMeta.openAiInvocations}.`,
      { kind: "SYSTEM", eventType: "scan_completed_local" },
    );
    delta.commentaryLines.forEach((line) => {
      addLocalCommentary(line, { kind: "SYSTEM", eventType: "scan_delta_local" });
    });
    prevSnapshotRef.current = snap;

    let cancelled = false;
    void (async () => {
      setNarrateBusy(true);
      try {
        const res = await fetch("/api/commander/narrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ digest, prefs, heuristicSummary: heuristic }),
        });
        const j = (await res.json()) as {
          narrative?: string | null;
          blockedReason?: string | null;
        };
        if (cancelled) return;
        setExecutiveAi(j.narrative ?? j.blockedReason ?? null);
      } catch {
        if (!cancelled) {
          setExecutiveAi("Narration unavailable right now — using strict heuristic summary only.");
        }
      } finally {
        if (!cancelled) setNarrateBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addLocalCommentary, desk.lastCompletedAt, desk.lastSnapshot, desk.scanning, prefs]);

  const normalizeAllocation = (next: CommanderPrefs["allocation"]) => {
    const t = next.stocksPct + next.optionsPct + next.cryptoPct + next.cashPct;
    if (t <= 0) return next;
    const k = 100 / t;
    const s = Math.round(next.stocksPct * k);
    const o = Math.round(next.optionsPct * k);
    const cr = Math.round(next.cryptoPct * k);
    const cash = Math.max(0, 100 - s - o - cr);
    return { stocksPct: s, optionsPct: o, cryptoPct: cr, cashPct: cash };
  };

  const triggerBackgroundScan = useCallback(async () => {
    addLocalCommentary("Background worker: manual immediate scan requested.", {
      kind: "SYSTEM",
      eventType: "manual_background_scan_requested",
    });
    try {
      const res = await fetch("/api/commander/force-scan", { method: "POST" });
      if (!res.ok) {
        addLocalCommentary("Background worker: force scan request failed.", {
          kind: "RISK_ALERT",
          eventType: "manual_background_scan_failed",
        });
        return;
      }
      addLocalCommentary("Background worker accepted manual scan request.", {
        kind: "SYSTEM",
        eventType: "manual_background_scan_accepted",
      });
    } catch {
      addLocalCommentary("Background worker request failed (network/server).", {
        kind: "RISK_ALERT",
        eventType: "manual_background_scan_failed",
      });
    }
  }, [addLocalCommentary]);

  const updateAccountCapital = useCallback(
    async (
      accountId: string,
      payload: { cashBalance?: number; cashDelta?: number },
      successLabel: string,
    ) => {
      setAccountBusy(accountId);
      try {
        const res = await fetch("/api/virtual-accounts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, ...payload }),
        });
        const body = (await res.json()) as {
          error?: string;
          account?: {
            id: string;
            cashBalance: string | number;
            startingCash: string | number;
            name: string;
            subPortfolio: string;
          };
        };
        if (!res.ok || !body.account) {
          addLocalCommentary(
            `Capital update failed: ${body.error ?? "unexpected error while updating account cash."}`,
            {
              kind: "RISK_ALERT",
              eventType: "capital_update_failed",
              payload: { accountId },
            },
          );
          return;
        }

        const nextCash = Number(body.account.cashBalance);
        const nextStart = Number(body.account.startingCash);
        setAccountRows((rows) =>
          rows.map((r) =>
            r.id === accountId
              ? {
                  ...r,
                  cashBalance: Number.isFinite(nextCash) ? nextCash : r.cashBalance,
                  startingCash: Number.isFinite(nextStart) ? nextStart : r.startingCash,
                  name: body.account?.name ?? r.name,
                  subPortfolio: body.account?.subPortfolio ?? r.subPortfolio,
                }
              : r,
          ),
        );
        setCashSetDraft((d) => ({ ...d, [accountId]: nextCash.toFixed(2) }));
        setCashDeltaDraft((d) => ({ ...d, [accountId]: "0" }));

        addLocalCommentary(successLabel, {
          kind: "SYSTEM",
          eventType: "capital_updated",
          payload: { accountId, cashBalance: nextCash },
        });
        void triggerBackgroundScan();
        void runScan();
      } catch {
        addLocalCommentary("Capital update failed (network/server).", {
          kind: "RISK_ALERT",
          eventType: "capital_update_failed",
          payload: { accountId },
        });
      } finally {
        setAccountBusy(null);
      }
    },
    [addLocalCommentary, runScan, triggerBackgroundScan],
  );

  const submitCommand = async () => {
    const t = commandInput.trim();
    if (!t || chatBusy) return;
    setCommandInput("");
    setChat((c) => [...c, { role: "user", text: t }]);
    setChatBusy(true);
    setCommandTrace([
      { label: "Parse request", status: "done", detail: "Intent parsed from natural language." },
      {
        label: "Fetch live data",
        status: "running",
        detail: "Pulling a fresh scanner snapshot from real providers.",
      },
      {
        label: "Rank candidates",
        status: "running",
        detail: "Applying strategy filters and confidence/risk ordering.",
      },
      {
        label: "OpenAI reasoning",
        status: "running",
        detail: "Preparing reasoning call with digest + strategy context.",
      },
    ]);
    setChat((c) => [
      ...c,
      {
        role: "assistant",
        text: "Executing now: parsing request, fetching live data, re-ranking candidates, then reasoning.",
      },
    ]);
    addLocalCommentary(`Command desk: received "${t.slice(0, 80)}".`, {
      kind: "COMMAND_RUN",
      eventType: "command_received",
    });

    let liveSnapshot = desk.lastSnapshot;
    let digest = buildScanDigest(liveSnapshot);
    try {
      const staleMs = desk.lastCompletedAt
        ? Date.now() - new Date(desk.lastCompletedAt).getTime()
        : Number.POSITIVE_INFINITY;
      if (staleMs > 90_000 || !liveSnapshot) {
        const scanRes = await fetch("/api/scanner", { cache: "no-store" });
        if (scanRes.ok) {
          liveSnapshot = (await scanRes.json()) as ScannerSnapshot;
          digest = buildScanDigest(liveSnapshot);
          addLocalCommentary("Command desk: pulled a fresh real-data snapshot.", {
            kind: "COMMAND_RUN",
            eventType: "command_fresh_snapshot",
          });
          setCommandTrace((steps) =>
            steps.map((s) =>
              s.label === "Fetch live data"
                ? { ...s, status: "done", detail: "Live scanner snapshot fetched successfully." }
                : s,
            ),
          );
        } else {
          addLocalCommentary(
            "Command desk: live snapshot fetch failed, using latest available snapshot.",
            {
              kind: "RISK_ALERT",
              eventType: "command_snapshot_fallback",
            },
          );
          setCommandTrace((steps) =>
            steps.map((s) =>
              s.label === "Fetch live data"
                ? {
                    ...s,
                    status: "blocked",
                    detail: "Could not fetch fresh snapshot; using latest local scan.",
                  }
                : s,
            ),
          );
        }
      } else {
        setCommandTrace((steps) =>
          steps.map((s) =>
            s.label === "Fetch live data"
              ? {
                  ...s,
                  status: "done",
                  detail: "Recent snapshot is fresh; reusing latest real-data scan.",
                }
              : s,
          ),
        );
      }
      setCommandTrace((steps) =>
        steps.map((s) =>
          s.label === "Rank candidates"
            ? {
                ...s,
                status: digest ? "done" : "blocked",
                detail: digest
                  ? `Ranked ${digest.decisions.length} decision(s) with ${
                      digest.decisions.filter((d) => d.decision === "TRADE").length
                    } trade candidate(s).`
                  : "No digest available yet; ranking step is blocked.",
              }
            : s,
        ),
      );

      const res = await fetch("/api/commander/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: t, digest, prefs }),
      });
      const j = (await res.json()) as {
        answer?: string;
        blockedReason?: string;
        trace?: CommandTraceStep[];
      };
      addLocalCommentary(
        `Command desk: reasoning completed${j.blockedReason ? ` (${j.blockedReason})` : ""}.`,
        {
          kind: j.blockedReason ? "RISK_ALERT" : "COMMAND_RUN",
          eventType: "command_reasoning_complete",
        },
      );
      if (Array.isArray(j.trace) && j.trace.length) {
        setCommandTrace(j.trace);
      } else {
        setCommandTrace((steps) =>
          steps.map((s) =>
            s.label === "OpenAI reasoning"
              ? {
                  ...s,
                  status: "done",
                  detail: "Reasoning response returned to chat.",
                }
              : s,
          ),
        );
      }
      setChat((c) => [
        ...c,
        {
          role: "assistant",
          text: j.answer ?? j.blockedReason ?? "No answer.",
        },
      ]);
    } catch {
      addLocalCommentary("Command desk: execution failed before answer returned.", {
        kind: "RISK_ALERT",
        eventType: "command_failed",
      });
      setCommandTrace((steps) =>
        steps.map((s) =>
          s.status === "running"
            ? { ...s, status: "failed", detail: "Execution failed before completion." }
            : s,
        ),
      );
      setChat((c) => [
        ...c,
        {
          role: "assistant",
          text: "Command request failed — check connection and try again.",
        },
      ]);
    } finally {
      setChatBusy(false);
    }
  };

  const renderIdeaRow = (row: CommanderIdeaRow) => {
    const key = `${row.symbol}-${row.assetType}-${row.stance}`;
    const open = expandedIdea === key;
    return (
      <div
        key={key}
        className="border-b border-[var(--border)] py-2 text-xs last:border-0"
      >
        <div
          role="button"
          tabIndex={0}
          className="flex w-full flex-wrap items-start justify-between gap-2 text-left"
          onClick={() => setExpandedIdea(open ? null : key)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setExpandedIdea(open ? null : key);
            }
          }}
        >
          <div>
            <span className="font-semibold text-foreground">{row.symbol}</span>{" "}
            <span className="text-[var(--muted)]">{row.assetType}</span>{" "}
            <span className="rounded bg-white/10 px-1.5 py-0.5">{row.stance}</span>{" "}
            <span className="text-[var(--muted)]">{row.bucket.replace(/_/g, " ")}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--muted)] hover:bg-white/5"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSourceIdea(row);
              }}
            >
              Sources
            </button>
            <div className="text-[var(--muted)]">
              conf {row.confidence.toFixed(1)} · risk {row.riskScore.toFixed(1)}
            </div>
          </div>
        </div>
        <p className="mt-1 text-[var(--muted)]">{row.standout}</p>
        {open && (
          <div className="mt-2 space-y-1 rounded-md border border-[var(--border)] bg-black/20 p-2">
            <p>
              <span className="text-[var(--muted)]">Catalyst: </span>
              {row.catalyst}
            </p>
            <p>
              <span className="text-[var(--muted)]">Hold: </span>
              {row.holdPeriod}
            </p>
            <p>
              <span className="text-[var(--muted)]">Thesis: </span>
              {row.thesis}
            </p>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-[10px] text-[var(--muted)]">
              {row.tradeSummary}
            </pre>
            <button
              type="button"
              className="mt-1 text-[10px] text-[var(--accent)]"
              onClick={() => navigator.clipboard.writeText(row.tradeSummary)}
            >
              Copy trade summary
            </button>
            <div className="mt-2 border-t border-[var(--border)] pt-2">
              <p className="text-[10px] font-medium text-foreground">Reasoning trail</p>
              <ul className="mt-1 space-y-1">
                {row.reasoningTrail.map((s, i) => (
                  <li key={i} className={s.ok === false ? "text-amber-200/90" : "text-[var(--muted)]"}>
                    <strong className="text-foreground">{s.label}:</strong> {s.detail}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    );
  };

  const boardSection = (title: string, rows: CommanderIdeaRow[]) => (
    <div className="card p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {title}
      </h3>
      <div className="mt-2 max-h-64 overflow-y-auto">{rows.length ? rows.map(renderIdeaRow) : <p className="text-xs text-[var(--muted)]">None this pass.</p>}</div>
    </div>
  );

  const aiThinking =
    desk.scanning || chatBusy || narrateBusy || Boolean(desk.openAiSymbol);
  const aiThinkingLabel = desk.openAiSymbol
    ? `AI thinking on ${desk.openAiSymbol}…`
    : chatBusy
      ? "AI thinking on your command…"
      : narrateBusy
        ? "AI writing executive desk read…"
        : desk.scanning
          ? "AI running scan reasoning…"
          : "AI idle";
  const aiNarrationBlocked =
    !!executiveAi &&
    /quota|rate limit|unavailable|missing|failed|auth/i.test(executiveAi);
  const latestHistory = scanHistory[0] ?? null;
  const bestIdeaNow =
    ideas.find((i) => i.stance === "TRADE") ?? ideas.find((i) => i.stance === "WATCH") ?? null;
  const strongestBucketRowsNow: Array<[string, number]> = [
    ["aggressive", buckets.aggressive_growth.length],
    ["defensive", buckets.defensive.length],
    ["income", buckets.highest_income.length],
    ["options", buckets.options.length],
    ["crypto", buckets.crypto.length],
  ];
  const strongestBucketNow = strongestBucketRowsNow.sort((a, b) => b[1] - a[1])[0];
  const strongestCategoryNow =
    (strongestBucketNow?.[1] ?? 0) > 0
      ? strongestBucketNow?.[0] ?? "n/a"
      : latestHistory?.strongestCategory ?? "n/a";
  const bestIdeaLabelNow =
    bestIdeaNow != null ? `${bestIdeaNow.symbol} · ${bestIdeaNow.stance}` : latestHistory?.bestIdea ?? null;
  const backgroundRunIsNewer =
    !!latestHistory &&
    (!desk.lastCompletedAt ||
      new Date(latestHistory.completedAt).getTime() > new Date(desk.lastCompletedAt).getTime());
  const bestIdeaDisplay = backgroundRunIsNewer
    ? (latestHistory?.bestIdea ?? bestIdeaLabelNow)
    : bestIdeaLabelNow;
  const strongestCategoryDisplay = backgroundRunIsNewer
    ? (latestHistory?.strongestCategory ?? strongestCategoryNow)
    : strongestCategoryNow;
  const nextScanSec = deskHeartbeat.nextScheduledScanAt
    ? Math.max(0, Math.floor((new Date(deskHeartbeat.nextScheduledScanAt).getTime() - clockNow) / 1000))
    : null;
  const idleStatusLine = deskHeartbeat.scanInProgress
    ? "Worker currently running a background scan."
    : deskHeartbeat.behindSchedule
      ? "Worker is behind schedule; awaiting next successful cycle."
      : nextScanSec != null
        ? `Waiting for next scheduled background scan in ${nextScanSec}s.`
        : "No schedule published yet.";
  const betweenScanStatus = deskHeartbeat.scanInProgress
    ? "Monitoring providers and evaluating symbol candidates."
    : deskHeartbeat.degradedProviders.length
      ? `Monitoring degraded providers: ${deskHeartbeat.degradedProviders.join(", ")}.`
      : latestHistory?.whatChanged?.toLowerCase().includes("no new changes")
        ? "No new market-state changes detected on the latest completed scan."
        : "Watching provider health and earnings window between scheduled scans.";
  const totalEditableCash = accountRows.reduce((sum, a) => sum + a.cashBalance, 0);
  const searchUniverse = desk.lastSnapshot?.universe ?? watchlist;
  const searchUniverseLabel = searchUniverse.length
    ? searchUniverse.join(", ")
    : "none configured";
  const universeSourceLabel = (() => {
    const source = desk.lastSnapshot?.universeSource;
    if (source === "explicit_symbol") return "single-symbol command";
    if (source === "watchlist") return "watchlist symbols";
    if (source === "portfolio_holdings") return "portfolio holdings";
    if (source === "none") return "no source configured";
    return watchlist.length > 0 ? "watchlist symbols" : "no source configured";
  })();
  const symbolProgressRows = Object.entries(desk.symbolProgress).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const stepRows = Object.entries(desk.steps).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Portfolio Commander</h1>
          <p className="text-sm text-[var(--muted)]">
            One desk — live scan, strict data labels, strategy-linked narration.
          </p>
          <p className="mt-1 text-xs">
            <span
              className={`rounded px-2 py-0.5 ${
                aiThinking ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10 text-[var(--muted)]"
              }`}
            >
              {aiThinkingLabel}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={desk.scanning}
            onClick={() => void desk.runScan()}
          >
            {desk.scanning ? "Scanning preview…" : "Run foreground preview scan"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-foreground"
            onClick={() => void triggerBackgroundScan()}
          >
            Trigger background scan now
          </button>
          <button
            type="button"
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-foreground disabled:opacity-50"
            disabled={saving || desk.scanning}
            onClick={() => void applyAndRescan()}
          >
            Apply strategy &amp; rescan
          </button>
          <button
            type="button"
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-foreground"
            onClick={() => setTab("portfolio")}
          >
            Adjust simulated cash
          </button>
        </div>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Worker heartbeat: {deskHeartbeat.deskAlive ? "alive" : "stale"} · status{" "}
        {deskHeartbeat.workerStatus} · {idleStatusLine}
      </p>
      <p className="text-xs text-[var(--muted)]">{betweenScanStatus}</p>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="card p-3">
          <p className="text-[10px] uppercase text-[var(--muted)]">Desk alive</p>
          <p className={`mt-2 text-sm font-semibold ${deskHeartbeat.deskAlive ? "text-emerald-300" : "text-red-300"}`}>
            {deskHeartbeat.deskAlive ? "YES" : "NO"}
          </p>
          <p className="mt-1 text-[10px] text-[var(--muted)]">
            Feed: {feedConnected ? "connected" : "reconnecting"}
          </p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] uppercase text-[var(--muted)]">Last heartbeat</p>
          <p className="mt-2 text-xs text-foreground">{timeAgo(deskHeartbeat.workerLastHeartbeatAt)}</p>
          <p className="mt-1 text-[10px] text-[var(--muted)]">
            lag {deskHeartbeat.workerLagSec != null ? `${deskHeartbeat.workerLagSec}s` : "—"}
          </p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] uppercase text-[var(--muted)]">Last completed scan</p>
          <p className="mt-2 text-xs text-foreground">{timeAgo(deskHeartbeat.lastCompletedScanAt)}</p>
          <p className="mt-1 text-[10px] text-[var(--muted)]">
            {deskHeartbeat.lastCompletedScanAt
              ? new Date(deskHeartbeat.lastCompletedScanAt).toLocaleTimeString()
              : "—"}
          </p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] uppercase text-[var(--muted)]">Next scheduled scan</p>
          <p className="mt-2 text-xs text-foreground">
            {nextScanSec != null ? `${nextScanSec}s` : "—"}
          </p>
          <p className="mt-1 text-[10px] text-[var(--muted)]">
            cadence {deskHeartbeat.cadenceMinutes}m
          </p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] uppercase text-[var(--muted)]">Worker status</p>
          <p
            className={`mt-2 text-xs font-semibold ${
              deskHeartbeat.workerStatus === "ERROR"
                ? "text-red-300"
                : deskHeartbeat.workerStatus === "DEGRADED"
                  ? "text-amber-200"
                  : "text-emerald-300"
            }`}
          >
            {deskHeartbeat.workerStatus}
          </p>
          <p className="mt-1 text-[10px] text-[var(--muted)]">
            {deskHeartbeat.workerLastError ?? deskHeartbeat.deskLastError ?? "No active faults."}
          </p>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Strategy control center</h2>
          <span className="text-[10px] text-[var(--muted)]">
            {saving ? "Saving…" : "Changes auto-sync & trigger rescan"}
          </span>
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <label className="block text-xs text-[var(--muted)]">
            Primary mode
            <select
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-black/30 px-3 py-2 text-sm"
              value={prefs.primaryMode}
              onChange={(e) =>
                setPrefs((p) => ({
                  ...p,
                  primaryMode: e.target.value as CommanderPrimaryMode,
                }))
              }
            >
              {PRIMARY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-[var(--muted)]">
            Risk level
            <select
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-black/30 px-3 py-2 text-sm"
              value={prefs.riskLevel}
              onChange={(e) =>
                setPrefs((p) => ({
                  ...p,
                  riskLevel: e.target.value as CommanderPrefs["riskLevel"],
                }))
              }
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["stocksPct", "Stocks %"],
              ["optionsPct", "Options %"],
              ["cryptoPct", "Crypto %"],
              ["cashPct", "Cash %"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="block text-xs text-[var(--muted)]">
              {label}
              <input
                type="range"
                min={0}
                max={100}
                className="mt-1 w-full"
                value={prefs.allocation[k]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setPrefs((p) => ({
                    ...p,
                    allocation: normalizeAllocation({ ...p.allocation, [k]: v }),
                  }));
                }}
              />
              <span className="text-foreground">{prefs.allocation[k]}%</span>
            </label>
          ))}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ["earningsFocus", "Earnings focus"],
              ["highConvictionOnly", "High conviction only"],
              ["incomePriority", "Income priority"],
              ["growthPriority", "Growth priority"],
              ["defensiveBias", "Defensive bias"],
              ["cryptoEnabled", "Crypto enabled (data)"],
              ["optionsEnabled", "Options enabled"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                checked={prefs.toggles[key]}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    toggles: { ...p.toggles, [key]: e.target.checked },
                  }))
                }
              />
              {label}
            </label>
          ))}
        </div>
        <div className="mt-3 rounded-md border border-[var(--border)] bg-black/20 px-3 py-2 text-[11px] text-[var(--muted)]">
          <p>
            Capital used by sizing logic is based on your live simulated portfolio value (currently{" "}
            <span className="text-foreground">
              ${totalEditableCash.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>{" "}
            cash editable from this desk).
          </p>
        </div>
        <p className="mt-3 text-[10px] text-[var(--muted)]">
          Engine mode: <strong className="text-foreground">{strategyModeFromPrimary(prefs.primaryMode)}</strong> ·
          Notification threshold:{" "}
          {notificationPrefs.minTradeAlertConfidence ?? "default"} · High-conviction alerts:{" "}
          {notificationPrefs.alertsHighConvictionOnly ? "on" : "off"}
        </p>
      </div>

      <div className="card border-[var(--accent)]/40 bg-[var(--accent-dim)]/20 p-4">
        <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--muted)]">
          What matters right now
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {executiveHeuristic || "Waiting for first scan…"}
        </p>
        {desk.lastSnapshot && (
          <p className="mt-2 text-[10px] text-[var(--muted)]">
            Scan stats: symbols {desk.lastSnapshot.scanMeta.symbolsChecked} · passed gates{" "}
            {desk.lastSnapshot.scanMeta.passedToOpenAiGate} · OpenAI calls{" "}
            {desk.lastSnapshot.scanMeta.openAiInvocations}
          </p>
        )}
        {executiveAi && (
          <div
            className={`mt-3 border-t border-[var(--border)] pt-3 text-sm ${
              aiNarrationBlocked ? "text-amber-200" : "text-[var(--muted)]"
            }`}
          >
            <p className="text-[10px] font-medium text-foreground">
              {aiNarrationBlocked ? "AI desk read (blocked)" : "AI desk read"}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{executiveAi}</p>
          </div>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="card p-3">
          <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Best opportunity now</p>
          {bestIdeaDisplay ? (
            <>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {bestIdeaDisplay}
              </p>
              {bestIdeaNow && !backgroundRunIsNewer && (
                <>
                  <p className="mt-1 text-xs text-[var(--muted)]">{bestIdeaNow.standout}</p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">
                    Confidence {bestIdeaNow.confidence.toFixed(1)} · Risk{" "}
                    {bestIdeaNow.riskScore.toFixed(1)}
                  </p>
                </>
              )}
              {(backgroundRunIsNewer || !bestIdeaNow) && latestHistory?.whatChanged && (
                <p className="mt-1 text-xs text-[var(--muted)]">{latestHistory.whatChanged}</p>
              )}
            </>
          ) : (
            <p className="mt-2 text-xs text-amber-200">No qualified idea yet this cycle.</p>
          )}
        </div>
        <div className="card p-3">
          <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Strongest category now</p>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {strongestCategoryDisplay.toUpperCase()}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {(strongestBucketNow?.[1] ?? 0) > 0
              ? `${strongestBucketNow?.[1] ?? 0} candidate row(s) currently leading.`
              : "From latest background scan history."}
          </p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] font-medium uppercase text-[var(--muted)]">What changed</p>
          <p className="mt-2 text-xs text-[var(--muted)]">{lastScanDelta}</p>
          {deskHeartbeat.degradedProviders.length > 0 && (
            <p className="mt-2 text-[10px] text-amber-200">
              Provider degraded: {deskHeartbeat.degradedProviders.join(", ")}
            </p>
          )}
          <p className="mt-2 text-[10px] text-[var(--muted)]">
            Avoid bucket now: {buckets.avoid.slice(0, 3).map((i) => i.symbol).join(", ") || "none"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-[var(--border)] pb-2">
        {TABS.map((t) => (
          <button key={t} type="button" className={tabCls(tab === t)} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="card p-3 xl:col-span-2">
            <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Market summary</p>
            <p className="mt-1 text-xs text-[var(--accent)]">{formatRealDataLabel(marketStatus)}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Universe source: {universeSourceLabel}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Search scope: {searchUniverseLabel}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Quotes / candles / options / earnings: {desk.lastSnapshot?.dataSources.quotes ?? dataStack.quotes} ·{" "}
              {desk.lastSnapshot?.dataSources.options ?? dataStack.options}
            </p>
          </div>
          <div className="card p-3">
            <p className="text-[10px] font-medium uppercase text-[var(--muted)]">API activity</p>
            <ul className="mt-2 space-y-2 text-xs">
              {providerHealth.map((p) => (
                <li key={p.id} className="rounded border border-[var(--border)] bg-black/20 p-2">
                  <p className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{p.label}</span>
                    <span
                      className={
                        p.status === "ok"
                          ? "text-emerald-300"
                          : p.status === "slow"
                            ? "text-amber-200"
                            : "text-red-300"
                      }
                    >
                      {p.status.toUpperCase()}
                    </span>
                  </p>
                  <p className="mt-1 text-[var(--muted)]">{p.detail}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-3 xl:col-span-3">
            <p className="text-[10px] font-medium uppercase text-[var(--muted)]">
              AI search activity (live)
            </p>
            <p className="mt-1 text-[10px] text-[var(--muted)]">
              Searching {searchUniverse.length} symbol(s) from {universeSourceLabel}:{" "}
              <span className="text-foreground">{searchUniverseLabel}</span>
            </p>
            <div className="mt-2 grid gap-2 lg:grid-cols-3">
              <div className="rounded border border-[var(--border)] bg-black/20 p-2">
                <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Per-symbol phase</p>
                <ul className="mt-1 max-h-36 space-y-1 overflow-y-auto text-xs">
                  {symbolProgressRows.length === 0 && (
                    <li className="text-[var(--muted)]">No symbol progress yet. Run/await a scan.</li>
                  )}
                  {symbolProgressRows.map(([sym, phase]) => (
                    <li key={sym} className="flex items-center justify-between">
                      <span className="font-mono text-foreground">{sym}</span>
                      <span
                        className={
                          phase === "completed"
                            ? "text-emerald-300"
                            : phase === "openai"
                              ? "text-sky-300"
                              : phase === "stopped"
                                ? "text-amber-200"
                                : "text-[var(--muted)]"
                        }
                      >
                        {phase}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded border border-[var(--border)] bg-black/20 p-2">
                <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Pipeline state</p>
                <ul className="mt-1 max-h-36 space-y-1 overflow-y-auto text-xs">
                  {stepRows.length === 0 && (
                    <li className="text-[var(--muted)]">Waiting for first step updates.</li>
                  )}
                  {stepRows.map(([step, status]) => (
                    <li key={step} className="flex items-center justify-between gap-2">
                      <span className="truncate text-[var(--muted)]">{step}</span>
                      <span
                        className={
                          status === "done"
                            ? "text-emerald-300"
                            : status === "running"
                              ? "text-sky-300"
                              : status === "failed"
                                ? "text-red-300"
                                : "text-[var(--muted)]"
                        }
                      >
                        {status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded border border-[var(--border)] bg-black/20 p-2">
                <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Latest scan logs</p>
                <ul className="mt-1 max-h-36 space-y-1 overflow-y-auto font-mono text-[10px]">
                  {desk.lines.length === 0 && (
                    <li className="text-[var(--muted)]">No stream lines yet.</li>
                  )}
                  {desk.lines.slice(-10).map((line) => (
                    <li
                      key={line.id}
                      className={line.level === "error" ? "text-red-300" : "text-[var(--muted)]"}
                    >
                      {line.text}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="card p-3 xl:col-span-3">
            <p className="text-[10px] font-medium uppercase text-[var(--muted)]">
              Background scan history
            </p>
            <div className="mt-2 max-h-56 overflow-y-auto">
              {scanHistory.length === 0 && (
                <p className="text-xs text-[var(--muted)]">No background scans recorded yet.</p>
              )}
              {scanHistory.slice(0, 12).map((row) => (
                <div
                  key={row.id}
                  className="mb-1 rounded border border-[var(--border)] bg-black/20 px-2 py-1 text-xs"
                >
                  <p className="flex items-center justify-between">
                    <span className="font-medium text-foreground">
                      {new Date(row.completedAt).toLocaleTimeString()} · {row.status}
                    </span>
                    <span className="text-[var(--muted)]">
                      opp {row.opportunitiesCount} · OpenAI {row.openAiCalls}
                    </span>
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">
                    best {row.bestIdea ?? "none"} · strongest {row.strongestCategory ?? "none"}
                  </p>
                  {row.whatChanged && (
                    <p className="mt-1 text-[10px] text-[var(--muted)]">{row.whatChanged}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="card p-3 xl:col-span-2">
            <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Top opportunities (ranked)</p>
            <div className="mt-2 max-h-56 overflow-y-auto">
              {ideas.length ? (
                ideas.slice(0, 8).map(renderIdeaRow)
              ) : (
                <p className="text-xs text-[var(--muted)]">
                  No qualified ideas yet. The live desk will keep scanning.
                </p>
              )}
            </div>
          </div>
          <div className="card p-3">
            <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Why ideas got rejected</p>
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs text-[var(--muted)]">
              {rejectReasonCounts.length === 0 && (
                <li>No reject reasons yet — run a scan.</li>
              )}
              {rejectReasonCounts.map(([k, n]) => (
                <li key={k} className="flex items-center justify-between rounded border border-[var(--border)] bg-black/20 px-2 py-1">
                  <span className="mr-2 truncate">{k}</span>
                  <span className="font-medium text-foreground">{n}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-3 xl:col-span-2">
            <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Live trends (real candles)</p>
            <p className="mt-1 text-[10px] text-[var(--muted)]">
              REAL DATA USED when candles are present; each row shows last ~30 daily closes.
            </p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {watchTrends.map((row) => {
                const closes = row.bars.map((b) => b.c);
                const path = sparkPath(closes);
                const first = closes[0] ?? null;
                const last = closes[closes.length - 1] ?? null;
                const pct =
                  first && last && first > 0 ? ((last - first) / first) * 100 : null;
                const up = (pct ?? 0) >= 0;
                return (
                  <div key={row.symbol} className="rounded border border-[var(--border)] bg-black/20 p-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-foreground">{row.symbol}</p>
                      <p className="text-[10px] text-[var(--muted)]">{row.source}</p>
                    </div>
                    {!row.bars.length ? (
                      <p className="mt-2 text-[10px] text-amber-200">
                        BLOCKED: REQUIRED REAL DATA MISSING — {row.blockedReason ?? "No candles"}
                      </p>
                    ) : (
                      <>
                        <svg
                          viewBox="0 0 150 42"
                          className="mt-2 h-12 w-full rounded bg-black/30"
                          preserveAspectRatio="none"
                        >
                          <path
                            d={path}
                            fill="none"
                            stroke={up ? "#4ade80" : "#f87171"}
                            strokeWidth="2"
                          />
                        </svg>
                        <p className={`mt-1 text-[10px] ${up ? "text-emerald-300" : "text-red-300"}`}>
                          {last != null ? `$${last.toFixed(2)}` : "—"}{" "}
                          {pct != null ? `(${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)` : ""}
                        </p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="card p-3">
            <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Live news feed</p>
            <ul className="mt-2 max-h-80 space-y-2 overflow-y-auto text-xs">
              {liveNews.length === 0 && (
                <li className="text-amber-200">
                  BLOCKED: REQUIRED REAL DATA MISSING — news adapter unavailable.
                </li>
              )}
              {liveNews.map((n) => (
                <li key={n.id} className="rounded border border-[var(--border)] bg-black/20 p-2">
                  <p className="font-medium text-foreground">{n.headline}</p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">
                    {n.symbol ? `${n.symbol} · ` : ""}
                    {n.source}
                    {n.publishedAt ? ` · ${n.publishedAt}` : ""}
                  </p>
                  {n.url && (
                    <a
                      href={n.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block break-all text-[10px] text-[var(--accent)] underline"
                    >
                      {n.url}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-3">
            <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Simulated portfolio</p>
            <p className="mt-2 text-lg font-semibold">
              ${portfolio.totalEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-[var(--muted)]">
              {portfolio.accountCount} account(s) · {portfolio.openLots} open lot(s)
            </p>
          </div>
          <div className="card p-3">
            <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Watchlist marks</p>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
              {watchQuotes.map((w) => (
                <li key={w.symbol}>
                  <span className="font-medium text-foreground">{w.symbol}</span>{" "}
                  {w.last != null ? `$${w.last.toFixed(2)}` : <span className="text-amber-200">no quote</span>}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] text-[var(--muted)]">{formatRealDataLabel(marketStatus)}</p>
          </div>
          <div className="card p-3">
            <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Buckets</p>
            <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
              <li>Aggressive: {buckets.aggressive_growth.length}</li>
              <li>Defensive: {buckets.defensive.length}</li>
              <li>Income: {buckets.highest_income.length}</li>
              <li>Options: {buckets.options.length}</li>
              <li>Crypto: {buckets.crypto.length}</li>
              <li>Watch: {buckets.watchlist_only.length}</li>
              <li>Avoid: {buckets.avoid.length}</li>
            </ul>
          </div>
          <div className="card p-3">
            <p className="text-[10px] font-medium uppercase text-[var(--muted)]">Alerts / risk</p>
            <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-xs">
              {alerts.length === 0 && <li className="text-[var(--muted)]">No recent alerts.</li>}
              {alerts.map((a) => (
                <li key={a.id}>
                  <span className="font-medium text-foreground">{a.title}</span>
                  <span className="block text-[var(--muted)]">{a.body.slice(0, 120)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === "opportunities" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {boardSection("Best overall", ideas.slice(0, 12))}
          {boardSection("Aggressive growth", buckets.aggressive_growth)}
          {boardSection("Defensive", buckets.defensive)}
          {boardSection("Income", buckets.highest_income)}
          {boardSection("Options", buckets.options)}
          {boardSection("Crypto", buckets.crypto)}
          {boardSection("Watchlist only", buckets.watchlist_only)}
          {boardSection("Avoid / too risky", buckets.avoid)}
        </div>
      )}

      {tab === "options" && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--accent)]">{formatRealDataLabel(optionsStatus)}</p>
          {boardSection("Options ideas", buckets.options)}
        </div>
      )}

      {tab === "crypto" && (
        <div className="card p-4">
          <p className="text-sm font-medium text-foreground">Crypto opportunities</p>
          <p className="mt-2 text-xs text-amber-200">{formatRealDataLabel(cryptoStatus)}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Toggle &quot;Crypto enabled&quot; controls whether we would surface crypto — adapters are not wired in this STRICT build, so the panel stays blocked until real feeds exist.
          </p>
        </div>
      )}

      {tab === "earnings" && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--accent)]">{formatRealDataLabel(earnStatus)}</p>
          <div className="card overflow-x-auto p-3">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="text-[var(--muted)]">
                <tr>
                  <th className="p-2">Symbol</th>
                  <th className="p-2">When (UTC)</th>
                  <th className="p-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {earnings.map((e) => (
                  <tr key={e.id} className="border-t border-[var(--border)]">
                    <td className="p-2 font-medium text-foreground">{e.symbol}</td>
                    <td className="p-2 text-[var(--muted)]">{e.datetimeUtc ?? "—"}</td>
                    <td className="p-2 text-[var(--muted)]">{e.dataSource}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "portfolio" && (
        <div className="space-y-3">
          <div className="card p-4 text-sm">
            <p>Equity (marked): ${portfolio.totalEquity.toLocaleString()}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Editable cash across accounts: ${totalEditableCash.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
            <p className="mt-2 text-[var(--muted)]">
              Use the controls below to set cash directly or add/remove funding from each simulated account.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {accountRows.length === 0 && (
              <div className="card p-3 text-xs text-[var(--muted)]">
                No simulated accounts found. Create one in `Portfolio` or onboarding first.
              </div>
            )}
            {accountRows.map((a) => (
              <div key={a.id} className="card p-3">
                <p className="text-sm font-medium text-foreground">
                  {a.name} <span className="text-[10px] text-[var(--muted)]">({a.subPortfolio})</span>
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Starting cash ${a.startingCash.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  Current cash ${a.cashBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>

                <div className="mt-3 space-y-2">
                  <label className="block text-[10px] text-[var(--muted)]">
                    Set cash balance ($)
                    <div className="mt-1 flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        className="w-full rounded border border-[var(--border)] bg-black/20 px-2 py-1 text-xs text-foreground"
                        value={cashSetDraft[a.id] ?? ""}
                        onChange={(e) =>
                          setCashSetDraft((d) => ({ ...d, [a.id]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="rounded border border-[var(--border)] px-2 py-1 text-xs text-foreground disabled:opacity-50"
                        disabled={accountBusy === a.id}
                        onClick={() => {
                          const next = Number(cashSetDraft[a.id] ?? "");
                          if (!Number.isFinite(next) || next < 0) {
                            addLocalCommentary("Set cash failed: enter a valid non-negative amount.", {
                              kind: "RISK_ALERT",
                              eventType: "capital_invalid_input",
                            });
                            return;
                          }
                          void updateAccountCapital(
                            a.id,
                            { cashBalance: next },
                            `${a.name}: cash balance set to $${next.toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}.`,
                          );
                        }}
                      >
                        {accountBusy === a.id ? "Saving…" : "Set"}
                      </button>
                    </div>
                  </label>

                  <label className="block text-[10px] text-[var(--muted)]">
                    Add / remove cash (+/- $)
                    <div className="mt-1 flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        className="w-full rounded border border-[var(--border)] bg-black/20 px-2 py-1 text-xs text-foreground"
                        value={cashDeltaDraft[a.id] ?? "0"}
                        onChange={(e) =>
                          setCashDeltaDraft((d) => ({ ...d, [a.id]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="rounded border border-[var(--border)] px-2 py-1 text-xs text-foreground disabled:opacity-50"
                        disabled={accountBusy === a.id}
                        onClick={() => {
                          const delta = Number(cashDeltaDraft[a.id] ?? "0");
                          if (!Number.isFinite(delta) || delta === 0) {
                            addLocalCommentary("Funding change skipped: enter a non-zero amount.", {
                              kind: "RISK_ALERT",
                              eventType: "capital_invalid_input",
                            });
                            return;
                          }
                          void updateAccountCapital(
                            a.id,
                            { cashDelta: delta },
                            `${a.name}: cash ${delta >= 0 ? "increased" : "decreased"} by $${Math.abs(delta).toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}.`,
                          );
                        }}
                      >
                        {accountBusy === a.id ? "Saving…" : "Apply"}
                      </button>
                    </div>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "ai" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card flex max-h-[480px] flex-col p-3">
            <p className="text-xs font-medium text-foreground">Live analyst thread</p>
            <p className="text-[10px] text-[var(--muted)]">{formatRealDataLabel(reasoningStatus)}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {[
                "find me the best aggressive trade right now",
                "show me the best income setup",
                "scan for crypto momentum",
                "compare NVDA vs AMD",
                "find a safer defensive opportunity",
                "look for the best options setup into earnings",
              ].map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  className="rounded border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--muted)] hover:bg-white/5"
                  onClick={() => setCommandInput(cmd)}
                >
                  {cmd}
                </button>
              ))}
            </div>
            <div className="mt-2 flex-1 space-y-2 overflow-y-auto text-xs">
              {chat.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-md p-2 ${m.role === "user" ? "ml-4 bg-white/5" : "mr-4 bg-[var(--accent-dim)]/30"}`}
                >
                  <span className="text-[10px] uppercase text-[var(--muted)]">{m.role}</span>
                  <p className="mt-1 whitespace-pre-wrap text-foreground">{m.text}</p>
                </div>
              ))}
              {chatBusy && (
                <div className="mr-4 rounded-md bg-[var(--accent-dim)]/30 p-2">
                  <span className="text-[10px] uppercase text-[var(--muted)]">assistant</span>
                  <p className="mt-1 text-foreground">Thinking… checking strict scan digest and sources.</p>
                </div>
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                className="flex-1 rounded-md border border-[var(--border)] bg-black/30 px-2 py-2 text-xs"
                placeholder="e.g. compare NVDA vs AMD, best income setup…"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submitCommand()}
              />
              <button
                type="button"
                className="rounded-md bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                disabled={chatBusy}
                onClick={() => void submitCommand()}
              >
                {chatBusy ? "Thinking…" : "Send"}
              </button>
            </div>
            <div className="mt-2 rounded border border-[var(--border)] bg-black/20 p-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                Command execution trace
              </p>
              <ul className="mt-1 space-y-1 text-[10px]">
                {commandTrace.length === 0 && (
                  <li className="text-[var(--muted)]">
                    Run a command to see parse, data fetch, ranking, and AI reasoning steps.
                  </li>
                )}
                {commandTrace.map((s, i) => (
                  <li key={`${s.label}-${i}`} className="flex items-start justify-between gap-2">
                    <span className="text-[var(--muted)]">{s.label}</span>
                    <span
                      className={
                        s.status === "done"
                          ? "text-emerald-300"
                          : s.status === "running"
                            ? "text-sky-300"
                            : s.status === "blocked"
                              ? "text-amber-200"
                              : "text-red-300"
                      }
                    >
                      {s.status.toUpperCase()}
                    </span>
                    <span className="max-w-[58%] text-right text-[var(--muted)]">{s.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="card max-h-[480px] overflow-y-auto p-3">
            <p className="text-xs font-medium text-foreground">Live desk commentary</p>
            <ul className="mt-2 space-y-1 font-mono text-[10px] text-[var(--muted)]">
              {operatorCommentary.map((row) => (
                <li key={row.id} className="rounded border border-[var(--border)] bg-black/20 px-2 py-1">
                  <p className="flex items-center justify-between">
                    <span
                      className={
                        row.kind === "RISK_ALERT"
                          ? "text-amber-200"
                          : row.kind === "COMMAND_RUN"
                            ? "text-sky-300"
                            : row.kind === "STRATEGY_SHIFT"
                              ? "text-violet-300"
                              : "text-emerald-300"
                      }
                    >
                      {row.kind}
                    </span>
                    <span className="text-[var(--muted)]">{timeAgo(row.createdAt)}</span>
                  </p>
                  <p className="mt-1 text-[var(--foreground)]">{row.message}</p>
                </li>
              ))}
              {desk.lines.map((l) => (
                <li key={l.id} className={l.level === "error" ? "text-red-300" : ""}>
                  {l.text}
                </li>
              ))}
              {!feedConnected &&
                localCommentary.map((t, i) => (
                  <li key={`lc-${i}`} className="text-[var(--foreground)]">
                    {t}
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}

      {tab === "risk" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card p-3 text-xs">
            <p className="font-medium text-foreground">Scan meta</p>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[var(--muted)]">
              {desk.lastSnapshot
                ? JSON.stringify(desk.lastSnapshot.scanMeta, null, 2)
                : "No snapshot yet."}
            </pre>
          </div>
          <div className="card p-3 text-xs">
            <p className="font-medium text-foreground">Data stack</p>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[var(--muted)]">
              {JSON.stringify(desk.lastSnapshot?.dataSources ?? dataStack, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="card space-y-2 p-4 text-sm text-[var(--muted)]">
          <label className="block text-xs text-[var(--muted)]">
            Background scan cadence
            <select
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-black/30 px-3 py-2 text-sm text-foreground"
              value={prefs.scanCadenceMin}
              onChange={(e) =>
                setPrefs((p) => ({
                  ...p,
                  scanCadenceMin: Number(e.target.value) as CommanderPrefs["scanCadenceMin"],
                }))
              }
            >
              {[1, 3, 5, 10].map((m) => (
                <option key={m} value={m}>
                  Every {m} minute{m === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs">
            Next automatic background scan:{" "}
            <span className="text-foreground">
              {deskHeartbeat.nextScheduledScanAt
                ? `${new Date(deskHeartbeat.nextScheduledScanAt).toLocaleTimeString()} (${timeAgo(
                    deskHeartbeat.nextScheduledScanAt,
                  )})`
                : "not scheduled yet"}
            </span>
          </p>
          <p className="text-xs">
            Heartbeat status:{" "}
            <span className="text-foreground">
              {deskHeartbeat.workerStatus} · {deskHeartbeat.deskAlive ? "alive" : "stale"}
            </span>
          </p>
          <p>
            Deep notification &amp; journal controls:{" "}
            <Link href="/notifications" className="text-[var(--accent)] underline">
              Notifications
            </Link>
            ,{" "}
            <Link href="/strategy" className="text-[var(--accent)] underline">
              Strategy settings
            </Link>
            ,{" "}
            <Link href="/settings" className="text-[var(--accent)] underline">
              Settings
            </Link>
            .
          </p>
          <button
            type="button"
            className="text-xs text-[var(--accent)]"
            onClick={() => setPrefs({ ...DEFAULT_COMMANDER_PREFS })}
          >
            Reset commander UI prefs (local only until saved)
          </button>
        </div>
      )}

      {sourceIdea && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSourceIdea(null)}
        >
          <div
            className="card max-h-[80vh] w-full max-w-2xl overflow-y-auto p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-foreground">
                  Source transparency — {sourceIdea.symbol}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {sourceIdea.decision?.sourcesMissing?.length
                    ? `BLOCKED: REQUIRED REAL DATA MISSING — ${sourceIdea.decision.sourcesMissing.join(", ")}`
                    : "REAL DATA USED"}
                </p>
              </div>
              <button
                type="button"
                className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)]"
                onClick={() => setSourceIdea(null)}
              >
                Close
              </button>
            </div>

            <ul className="mt-3 space-y-2 text-xs">
              {sourceLinesForIdea(sourceIdea).map((line, i) => (
                <li
                  key={`${line.label}-${i}`}
                  className={`rounded border border-[var(--border)] p-2 ${
                    line.blocked ? "bg-amber-500/10" : "bg-black/20"
                  }`}
                >
                  <p className="font-medium text-foreground">{line.label}</p>
                  {line.href ? (
                    <a
                      href={line.href}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block break-all text-[var(--accent)] underline"
                    >
                      {line.value}
                    </a>
                  ) : (
                    <p className="mt-1 break-all text-[var(--muted)]">{line.value}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
