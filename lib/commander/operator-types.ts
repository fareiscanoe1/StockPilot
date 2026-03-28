export type CommanderWorkerStatus = "IDLE" | "RUNNING" | "WAITING" | "DEGRADED" | "ERROR";

export type CommanderCommentaryKind =
  | "SYSTEM"
  | "STRATEGY_SHIFT"
  | "COMMAND_RUN"
  | "RISK_ALERT";

export type CommanderDeskHeartbeat = {
  deskAlive: boolean;
  workerStatus: CommanderWorkerStatus;
  lastHeartbeatAt: string | null;
  lastCompletedScanAt: string | null;
  nextScheduledScanAt: string | null;
  scanInProgress: boolean;
  cadenceMinutes: 1 | 3 | 5 | 10;
  workerLagSec: number | null;
  workerLastHeartbeatAt: string | null;
  workerLastRunCompletedAt: string | null;
  workerLastError: string | null;
  deskLastError: string | null;
  degradedProviders: string[];
  behindSchedule: boolean;
};

export type CommanderScanHistoryRow = {
  id: string;
  startedAt: string;
  completedAt: string;
  bestIdea: string | null;
  bestIdeaCategory: string | null;
  strongestCategory: string | null;
  topRisks: string[];
  opportunitiesCount: number;
  openAiCalls: number;
  whatChanged: string | null;
  summaryText: string | null;
  status: "COMPLETED" | "ERROR";
};

export type CommanderCommentaryRow = {
  id: string;
  kind: CommanderCommentaryKind;
  eventType: string;
  message: string;
  createdAt: string;
  scanRunId: string | null;
};

export type CommanderFeedEvent =
  | {
      type: "hello";
      heartbeat: CommanderDeskHeartbeat;
      runs: CommanderScanHistoryRow[];
      commentary: CommanderCommentaryRow[];
    }
  | {
      type: "heartbeat";
      heartbeat: CommanderDeskHeartbeat;
    }
  | {
      type: "scan_run";
      run: CommanderScanHistoryRow;
    }
  | {
      type: "commentary";
      commentary: CommanderCommentaryRow;
    }
  | {
      type: "error";
      message: string;
    };
