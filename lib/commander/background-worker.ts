import prisma from "@/lib/db";
import { executeScannerSnapshot } from "@/lib/queries/scanner-snapshot";
import { parseCommanderFromCustomRules } from "@/lib/commander/prefs";
import { buildCommanderIdeas, groupIdeasByBucket } from "@/lib/commander/ideas";
import { buildExecutiveSummary } from "@/lib/commander/summary";
import { buildScanDigest } from "@/lib/commander/digest";
import { providerHealthFromScan } from "@/lib/scanner/provider-health";
import {
  COMMANDER_WORKER_NAME,
  appendCommanderCommentary,
  normalizeCadenceMinutes,
  touchDeskHeartbeat,
} from "@/lib/commander/operator-queries";
import type { CommanderScanRun, CommanderWorkerStatus, Prisma } from "@prisma/client";

function bestIdeaLine(best: ReturnType<typeof buildCommanderIdeas>[number] | null): string {
  if (!best) return "No qualified idea passed this scan.";
  const reason = (best.standout || best.catalyst || best.thesis || "").slice(0, 140).trim();
  return `${best.symbol} (${best.stance})${reason ? ` — ${reason}` : ""}`;
}

function strongestCategoryFromBuckets(rows: ReturnType<typeof buildCommanderIdeas>) {
  const b = groupIdeasByBucket(rows);
  const ranked: Array<[string, number]> = [
    ["aggressive", b.aggressive_growth.length],
    ["defensive", b.defensive.length],
    ["highest_income", b.highest_income.length],
    ["options", b.options.length],
    ["crypto", b.crypto.length],
    ["watchlist_only", b.watchlist_only.length],
    ["avoid", b.avoid.length],
  ];
  const top = ranked.sort((a, b2) => b2[1] - a[1])[0];
  if (!top || top[1] <= 0) return null;
  return top[0];
}

function topRisksFromScan(rows: ReturnType<typeof buildCommanderIdeas>) {
  const out: string[] = [];
  const elevated = rows
    .filter((r) => r.riskScore >= 7)
    .slice(0, 3)
    .map((r) => `${r.symbol} risk ${r.riskScore.toFixed(1)}`);
  if (elevated.length) out.push(`Elevated risk scores: ${elevated.join(", ")}`);

  const noTradeMap = new Map<string, number>();
  for (const r of rows) {
    if (r.stance !== "NO_TRADE") continue;
    const k = r.decision?.reasonCode ?? "UNKNOWN";
    noTradeMap.set(k, (noTradeMap.get(k) ?? 0) + 1);
  }
  const reasonTop = [...noTradeMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, n]) => `${k} (${n})`);
  if (reasonTop.length) out.push(`Top reject drivers: ${reasonTop.join(", ")}`);
  return out.slice(0, 4);
}

function blockedCategoriesFromProviderHealth(
  providerHealth: Array<{ id: string; status: "ok" | "slow" | "failed"; detail: string }>,
): string[] {
  const blocked = new Set<string>();
  for (const p of providerHealth) {
    if (p.status === "ok") continue;
    if (p.id === "polygon") blocked.add("options");
    if (p.id === "finnhub") {
      blocked.add("stocks");
      blocked.add("watchlist");
      blocked.add("earnings");
    }
    if (p.id === "openai") blocked.add("AI reasoning confidence layer");
  }
  return [...blocked];
}

function parseTopRisks(run: CommanderScanRun | null): string[] {
  if (!run || !Array.isArray(run.topRisks)) return [];
  return run.topRisks.filter((x): x is string => typeof x === "string");
}

function buildChangeSummary(input: {
  prevRun: CommanderScanRun | null;
  bestIdeaSymbol: string | null;
  bestIdeaNarrative: string;
  strongestCategory: string | null;
  opportunitiesCount: number;
  topRisks: string[];
}) {
  const { prevRun, bestIdeaSymbol, bestIdeaNarrative, strongestCategory, opportunitiesCount, topRisks } =
    input;
  if (!prevRun) {
    return "Initial baseline scan captured.";
  }
  const notes: string[] = [];

  const prevBest = prevRun.bestIdeaSymbol;
  if (bestIdeaSymbol !== prevBest) {
    if (bestIdeaSymbol && prevBest) {
      notes.push(`Best idea changed: ${bestIdeaSymbol} replaced ${prevBest}. ${bestIdeaNarrative}`);
    } else if (bestIdeaSymbol && !prevBest) {
      notes.push(`Best idea emerged: ${bestIdeaSymbol}. ${bestIdeaNarrative}`);
    } else if (!bestIdeaSymbol && prevBest) {
      notes.push(`Best idea dropped: ${prevBest} no longer qualified.`);
    }
  }

  if (strongestCategory !== prevRun.strongestCategory) {
    notes.push(
      `Strongest category shifted: ${prevRun.strongestCategory ?? "none"} -> ${
        strongestCategory ?? "none"
      }.`,
    );
  }

  const prevOpp = prevRun.opportunitiesCount;
  if (opportunitiesCount !== prevOpp) {
    const delta = opportunitiesCount - prevOpp;
    notes.push(
      `Opportunity count ${delta >= 0 ? "increased" : "decreased"} by ${Math.abs(delta)} (${prevOpp} -> ${opportunitiesCount}).`,
    );
  }

  const prevRisk = parseTopRisks(prevRun).join(" | ");
  const nowRisk = topRisks.join(" | ");
  if (prevRisk && nowRisk && prevRisk !== nowRisk) {
    notes.push("Risk profile changed versus prior scan.");
  }

  return notes.length ? notes.join(" ") : "No new changes detected versus prior scan.";
}

export type CommanderWorkerTickResult = {
  usersChecked: number;
  dueUsers: number;
  scannedUsers: number;
  errors: number;
};

export class CommanderBackgroundWorker {
  private async touchWorker(
    status: CommanderWorkerStatus,
    opts?: { lastRunStartedAt?: Date; lastRunCompletedAt?: Date; lastError?: string | null },
  ) {
    await prisma.commanderWorkerHeartbeat.upsert({
      where: { workerName: COMMANDER_WORKER_NAME },
      create: {
        workerName: COMMANDER_WORKER_NAME,
        status,
        lastHeartbeatAt: new Date(),
        lastRunStartedAt: opts?.lastRunStartedAt,
        lastRunCompletedAt: opts?.lastRunCompletedAt,
        lastError: opts?.lastError ?? null,
      },
      update: {
        status,
        lastHeartbeatAt: new Date(),
        lastRunStartedAt: opts?.lastRunStartedAt,
        lastRunCompletedAt: opts?.lastRunCompletedAt,
        lastError: opts?.lastError ?? null,
      },
    });
  }

  private async runDueForUser(userId: string, force = false): Promise<{
    due: boolean;
    scanned: boolean;
    error?: string;
  }> {
    const profile = await prisma.strategyProfile.findUnique({ where: { userId } });
    const mode = profile?.mode ?? "BALANCED";
    const prefs = parseCommanderFromCustomRules(profile?.customRules, mode);
    const cadence = normalizeCadenceMinutes(prefs.scanCadenceMin);
    const now = new Date();

    const state = await touchDeskHeartbeat(userId, cadence, "WAITING");
    const due = force || !state.nextScheduledScanAt || state.nextScheduledScanAt <= now;
    if (!due) return { due: false, scanned: false };

    const start = new Date();
    await prisma.commanderDeskState.update({
      where: { userId },
      data: {
        cadenceMinutes: cadence,
        workerStatus: "RUNNING",
        scanInProgress: true,
        lastHeartbeatAt: start,
        lastScanStartedAt: start,
        lastError: null,
      },
    });

    await appendCommanderCommentary({
      userId,
      kind: "SYSTEM",
      eventType: "scan_started",
      message: `Background scan started (${mode} / ${prefs.riskLevel} risk) across configured universe.`,
      payload: { mode, riskLevel: prefs.riskLevel, cadenceMinutes: cadence },
    });
    await appendCommanderCommentary({
      userId,
      kind: "SYSTEM",
      eventType: "fetching_providers",
      message: "Fetching provider data (quotes, candles, options, earnings, news) for this cycle.",
    });

    try {
      const snap = await executeScannerSnapshot({ userId });
      const rows = buildCommanderIdeas(snap, prefs);
      const digest = buildScanDigest(snap);
      const summaryText = buildExecutiveSummary(snap, rows, prefs);
      const completedAt = new Date();

      const best =
        rows.find((r) => r.stance === "TRADE") ?? rows.find((r) => r.stance === "WATCH") ?? null;
      const bestIdeaSymbol = best?.symbol ?? null;
      const bestIdeaCategory = best?.bucket ?? null;
      const strongestCategory = strongestCategoryFromBuckets(rows);
      const topRisks = topRisksFromScan(rows);
      const opportunitiesCount = rows.filter((r) => r.stance !== "NO_TRADE").length;

      const providerHealth = providerHealthFromScan(snap, null, snap.decisions);
      const degraded = providerHealth.filter((p) => p.status !== "ok");
      const blockedCategories = blockedCategoriesFromProviderHealth(providerHealth);

      const prevRun = await prisma.commanderScanRun.findFirst({
        where: { userId },
        orderBy: { completedAt: "desc" },
      });
      const changeSummary = buildChangeSummary({
        prevRun,
        bestIdeaSymbol,
        bestIdeaNarrative: bestIdeaLine(best),
        strongestCategory,
        opportunitiesCount,
        topRisks,
      });

      const run = await prisma.commanderScanRun.create({
        data: {
          userId,
          status: "COMPLETED",
          startedAt: start,
          completedAt,
          bestIdeaSymbol,
          bestIdeaCategory,
          strongestCategory,
          topRisks,
          opportunitiesCount,
          openAiCalls: snap.scanMeta.openAiInvocations,
          whatChanged: changeSummary,
          summaryText,
          providerHealth: JSON.parse(JSON.stringify(providerHealth)) as Prisma.InputJsonValue,
          scanMeta: JSON.parse(JSON.stringify(snap.scanMeta)) as Prisma.InputJsonValue,
          digest: JSON.parse(JSON.stringify(digest)) as Prisma.InputJsonValue,
        },
      });

      await appendCommanderCommentary({
        userId,
        scanRunId: run.id,
        kind: "SYSTEM",
        eventType: "ranking_complete",
        message: `Ranking complete: ${opportunitiesCount} opportunity row(s). Strongest category: ${
          strongestCategory ?? "none"
        }.`,
      });
      await appendCommanderCommentary({
        userId,
        scanRunId: run.id,
        kind: "SYSTEM",
        eventType: "openai_reasoning_complete",
        message: `OpenAI reasoning stage complete (${snap.scanMeta.openAiInvocations} call(s)).`,
      });

      if (!bestIdeaSymbol) {
        await appendCommanderCommentary({
          userId,
          scanRunId: run.id,
          kind: "RISK_ALERT",
          eventType: "no_valid_ideas",
          message: "No valid idea passed strict TRADE/WATCH qualification this scan.",
        });
      } else if (prevRun?.bestIdeaSymbol && prevRun.bestIdeaSymbol !== bestIdeaSymbol) {
        await appendCommanderCommentary({
          userId,
          scanRunId: run.id,
          kind: "SYSTEM",
          eventType: "best_idea_changed",
          message: `Best idea changed: ${bestIdeaSymbol} replaced ${prevRun.bestIdeaSymbol}. ${bestIdeaLine(
            best,
          )}`,
        });
      }

      const prevRisk = parseTopRisks(prevRun).join(" | ");
      const nowRisk = topRisks.join(" | ");
      if (prevRisk && nowRisk && prevRisk !== nowRisk) {
        await appendCommanderCommentary({
          userId,
          scanRunId: run.id,
          kind: "RISK_ALERT",
          eventType: "risk_changed",
          message: "Risk profile changed relative to the previous scan.",
        });
      }

      if (degraded.length) {
        await appendCommanderCommentary({
          userId,
          scanRunId: run.id,
          kind: "RISK_ALERT",
          eventType: "provider_degraded",
          message: `Provider degraded: ${degraded
            .map((d) => `${d.label} (${d.status})`)
            .join(", ")}. Blocked/degraded categories: ${
            blockedCategories.join(", ") || "unknown"
          }.`,
        });
      }

      await prisma.commanderDeskState.update({
        where: { userId },
        data: {
          cadenceMinutes: cadence,
          workerStatus: degraded.length ? "DEGRADED" : "WAITING",
          lastHeartbeatAt: completedAt,
          lastScanCompletedAt: completedAt,
          nextScheduledScanAt: new Date(completedAt.getTime() + cadence * 60_000),
          scanInProgress: false,
          lastError: null,
          lastBestIdeaSymbol: bestIdeaSymbol,
          lastStrongestCategory: strongestCategory,
          lastRiskSummary: topRisks.join(" | "),
        },
      });

      return { due: true, scanned: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const failedAt = new Date();
      await prisma.commanderScanRun.create({
        data: {
          userId,
          status: "ERROR",
          startedAt: start,
          completedAt: failedAt,
          opportunitiesCount: 0,
          openAiCalls: 0,
          whatChanged: "Background scan failed.",
          summaryText: msg.slice(0, 600),
        },
      });
      await appendCommanderCommentary({
        userId,
        kind: "RISK_ALERT",
        eventType: "scan_error",
        message: `Background scan failed: ${msg.slice(0, 220)}`,
      });
      await prisma.commanderDeskState.update({
        where: { userId },
        data: {
          cadenceMinutes: cadence,
          workerStatus: "ERROR",
          scanInProgress: false,
          lastError: msg.slice(0, 600),
          lastHeartbeatAt: failedAt,
          nextScheduledScanAt: new Date(failedAt.getTime() + cadence * 60_000),
        },
      });
      return { due: true, scanned: false, error: msg };
    }
  }

  async runDueUsersTick(input?: { userId?: string; force?: boolean }): Promise<CommanderWorkerTickResult> {
    const startedAt = new Date();
    await this.touchWorker("RUNNING", { lastRunStartedAt: startedAt, lastError: null });

    const users = input?.userId
      ? [{ id: input.userId }]
      : await prisma.user.findMany({ select: { id: true } });

    let dueUsers = 0;
    let scannedUsers = 0;
    let errors = 0;

    for (const user of users) {
      const result = await this.runDueForUser(user.id, input?.force === true);
      if (result.due) dueUsers += 1;
      if (result.scanned) scannedUsers += 1;
      if (result.error) errors += 1;
    }

    const finishedAt = new Date();
    await this.touchWorker(errors > 0 ? "DEGRADED" : "WAITING", {
      lastRunCompletedAt: finishedAt,
      lastError: errors > 0 ? `${errors} user scan(s) failed in last tick.` : null,
    });

    return {
      usersChecked: users.length,
      dueUsers,
      scannedUsers,
      errors,
    };
  }

  async runLoop(input?: { pollMs?: number }) {
    const pollMs = Math.max(5_000, input?.pollMs ?? 15_000);
    while (true) {
      try {
        await this.runDueUsersTick();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await this.touchWorker("ERROR", { lastError: msg.slice(0, 600) });
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
}
