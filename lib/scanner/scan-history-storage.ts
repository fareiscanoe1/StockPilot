import type { ScannerSnapshot } from "@/lib/queries/scanner-snapshot";

const KEY = "epai-scan-history-v1";
const MAX = 12;

export interface ScanHistoryEntry {
  id: string;
  finishedAt: string;
  durationMs: number;
  symbolsChecked: number;
  openAiCalls: number;
  tradeDecisions: number;
  topSymbol: string | null;
  topCatalyst: string | null;
  /** Full snapshot JSON for reopen */
  snapshotJson: string;
}

export function loadScanHistory(): ScanHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as ScanHistoryEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveScanHistory(entries: ScanHistoryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
  } catch {
    /* quota */
  }
}

export function appendScanHistoryEntry(input: {
  snapshot: ScannerSnapshot;
  durationMs: number;
}): ScanHistoryEntry[] {
  const { snapshot, durationMs } = input;
  const top = snapshot.candidates[0];
  const entry: ScanHistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    finishedAt: new Date().toISOString(),
    durationMs,
    symbolsChecked: snapshot.scanMeta.symbolsChecked,
    openAiCalls: snapshot.scanMeta.openAiInvocations,
    tradeDecisions: snapshot.scanMeta.tradeDecisionCount,
    topSymbol: top?.symbol ?? null,
    topCatalyst: top?.catalystSummary?.slice(0, 160) ?? null,
    snapshotJson: JSON.stringify(snapshot),
  };

  const prev = loadScanHistory();
  const next = [entry, ...prev.filter((e) => e.id !== entry.id)].slice(0, MAX);
  saveScanHistory(next);
  return next;
}

export function parseHistorySnapshot(json: string): ScannerSnapshot | null {
  try {
    return JSON.parse(json) as ScannerSnapshot;
  } catch {
    return null;
  }
}
