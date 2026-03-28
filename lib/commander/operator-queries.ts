import prisma from "@/lib/db";
import type {
  CommanderCommentary,
  CommanderCommentaryKind as PrismaCommentaryKind,
  CommanderDeskState,
  Prisma,
  CommanderScanRun,
  CommanderWorkerHeartbeat,
} from "@prisma/client";
import type {
  CommanderCommentaryRow,
  CommanderDeskHeartbeat,
  CommanderScanHistoryRow,
} from "./operator-types";

export const COMMANDER_WORKER_NAME = "commander";

export function normalizeCadenceMinutes(v: unknown): 1 | 3 | 5 | 10 {
  const n = Number(v);
  if (n === 1 || n === 3 || n === 5 || n === 10) return n;
  return 3;
}

export function toHistoryRow(row: CommanderScanRun): CommanderScanHistoryRow {
  return {
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt.toISOString(),
    bestIdea: row.bestIdeaSymbol,
    bestIdeaCategory: row.bestIdeaCategory,
    strongestCategory: row.strongestCategory,
    topRisks: Array.isArray(row.topRisks)
      ? row.topRisks.filter((x): x is string => typeof x === "string")
      : [],
    opportunitiesCount: row.opportunitiesCount,
    openAiCalls: row.openAiCalls,
    whatChanged: row.whatChanged,
    summaryText: row.summaryText,
    status: row.status,
  };
}

export function toCommentaryRow(row: CommanderCommentary): CommanderCommentaryRow {
  return {
    id: row.id,
    kind: row.kind,
    eventType: row.eventType,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    scanRunId: row.scanRunId,
  };
}

function degradedProvidersFromHealth(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const row = it as { label?: unknown; status?: unknown };
    const status = typeof row.status === "string" ? row.status.toLowerCase() : "";
    if (status === "failed" || status === "slow") {
      const label = typeof row.label === "string" ? row.label : "unknown provider";
      out.push(label);
    }
  }
  return out;
}

function buildHeartbeat(
  desk: CommanderDeskState | null,
  worker: CommanderWorkerHeartbeat | null,
  latestRun: CommanderScanRun | null,
): CommanderDeskHeartbeat {
  const now = Date.now();
  const cadence = normalizeCadenceMinutes(desk?.cadenceMinutes);
  const workerLagSec = worker?.lastHeartbeatAt
    ? Math.max(0, Math.round((now - worker.lastHeartbeatAt.getTime()) / 1000))
    : null;
  const behindSchedule =
    !!desk?.nextScheduledScanAt &&
    now - desk.nextScheduledScanAt.getTime() > Math.max(30_000, cadence * 60_000);
  const deskAlive = workerLagSec != null && workerLagSec <= Math.max(90, cadence * 180);

  return {
    deskAlive,
    workerStatus: desk?.workerStatus ?? worker?.status ?? "IDLE",
    lastHeartbeatAt: desk?.lastHeartbeatAt?.toISOString() ?? null,
    lastCompletedScanAt: desk?.lastScanCompletedAt?.toISOString() ?? null,
    nextScheduledScanAt: desk?.nextScheduledScanAt?.toISOString() ?? null,
    scanInProgress: desk?.scanInProgress ?? false,
    cadenceMinutes: cadence,
    workerLagSec,
    workerLastHeartbeatAt: worker?.lastHeartbeatAt?.toISOString() ?? null,
    workerLastRunCompletedAt: worker?.lastRunCompletedAt?.toISOString() ?? null,
    workerLastError: worker?.lastError ?? null,
    deskLastError: desk?.lastError ?? null,
    degradedProviders: degradedProvidersFromHealth(latestRun?.providerHealth),
    behindSchedule,
  };
}

export async function getCommanderOperatorBootstrap(
  userId: string,
  opts?: { runsTake?: number; commentaryTake?: number },
): Promise<{
  heartbeat: CommanderDeskHeartbeat;
  runs: CommanderScanHistoryRow[];
  commentary: CommanderCommentaryRow[];
}> {
  const runsTake = opts?.runsTake ?? 20;
  const commentaryTake = opts?.commentaryTake ?? 80;
  const [desk, worker, runs, commentary] = await Promise.all([
    prisma.commanderDeskState.findUnique({ where: { userId } }),
    prisma.commanderWorkerHeartbeat.findUnique({
      where: { workerName: COMMANDER_WORKER_NAME },
    }),
    runsTake > 0
      ? prisma.commanderScanRun.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: runsTake,
        })
      : Promise.resolve([] as CommanderScanRun[]),
    commentaryTake > 0
      ? prisma.commanderCommentary.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: commentaryTake,
        })
      : Promise.resolve([] as CommanderCommentary[]),
  ]);

  return {
    heartbeat: buildHeartbeat(desk, worker, runs[0] ?? null),
    runs: runs.map(toHistoryRow),
    commentary: commentary.map(toCommentaryRow),
  };
}

export async function appendCommanderCommentary(input: {
  userId: string;
  kind: PrismaCommentaryKind;
  eventType: string;
  message: string;
  scanRunId?: string | null;
  payload?: unknown;
}) {
  return prisma.commanderCommentary.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      eventType: input.eventType,
      message: input.message,
      scanRunId: input.scanRunId ?? null,
      payload:
        input.payload == null
          ? undefined
          : (JSON.parse(JSON.stringify(input.payload)) as Prisma.InputJsonValue),
    },
  });
}

export async function touchDeskHeartbeat(
  userId: string,
  cadenceMinutes: number,
  status?: CommanderDeskState["workerStatus"],
) {
  const now = new Date();
  return prisma.commanderDeskState.upsert({
    where: { userId },
    create: {
      userId,
      cadenceMinutes: normalizeCadenceMinutes(cadenceMinutes),
      workerStatus: status ?? "WAITING",
      lastHeartbeatAt: now,
      nextScheduledScanAt: now,
    },
    update: {
      cadenceMinutes: normalizeCadenceMinutes(cadenceMinutes),
      workerStatus: status ?? undefined,
      lastHeartbeatAt: now,
    },
  });
}
