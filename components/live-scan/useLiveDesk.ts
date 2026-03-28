"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LiveScanSummary,
  ScanStreamEvent,
  ScanTimingMetrics,
  SymbolDeskPhase,
} from "@/lib/scan/types";
import type { ScannerSnapshot } from "@/lib/queries/scanner-snapshot";
import type { StepStatus } from "./step-meta";
import {
  deskSoundsEnabled,
  playAlertThresholdMet,
  playHighConvictionChime,
  playScanCompleteTick,
  setDeskSoundsEnabled,
} from "@/lib/live-desk/sounds";
import {
  wouldMeetAlertThreshold,
} from "@/lib/scan/alert-eligibility";
import { isProminentConviction } from "./conviction";

const EVENTS_STORAGE_KEY = "epai-desk-stream-events";
const MAX_RECORDED = 360;
const WATCH_MINUTES_KEY = "epai-watch-minutes";

export type DeskStatusChipState =
  | "idle"
  | "scanning"
  | "waiting_next"
  | "error"
  | "openai_evaluating";

type StreamLine = { id: string; text: string; level?: string };

function pushLine(
  prev: StreamLine[],
  text: string,
  level?: string,
  max = 250,
): StreamLine[] {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const next = [...prev, { id, text, level }];
  return next.length > max ? next.slice(-max) : next;
}

function recordableEvent(ev: ScanStreamEvent): boolean {
  if (ev.type === "complete") return false;
  if (ev.type === "timing") return false;
  return true;
}

export function useLiveDesk() {
  const [scanning, setScanning] = useState(false);
  const [steps, setSteps] = useState<Record<string, StepStatus>>({});
  const [lines, setLines] = useState<StreamLine[]>([]);
  const [summary, setSummary] = useState<LiveScanSummary | null>(null);
  const [metrics, setMetrics] = useState<ScanTimingMetrics | null>(null);
  const [symbolProgress, setSymbolProgress] = useState<Record<string, SymbolDeskPhase>>({});
  const [lastSnapshot, setLastSnapshot] = useState<ScannerSnapshot | null>(null);
  const [lastCompletedAt, setLastCompletedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openAiSymbol, setOpenAiSymbol] = useState<string | null>(null);
  const [pulseHighlight, setPulseHighlight] = useState(false);
  const [pulseScanDone, setPulseScanDone] = useState(false);
  const [soundsOn, setSoundsOnState] = useState(true);

  const [watchMode, setWatchMode] = useState<"manual" | "auto">("manual");
  const [intervalMin, setIntervalMinState] = useState(5);
  const [countdown, setCountdown] = useState(0);

  const esRef = useRef<EventSource | null>(null);
  const recordedRef = useRef<ScanStreamEvent[]>([]);
  const alertPrefsRef = useRef<{
    minTradeAlertConfidence: number | null;
    alertsHighConvictionOnly: boolean;
  }>({ minTradeAlertConfidence: null, alertsHighConvictionOnly: false });

  const setIntervalMin = useCallback((n: number) => {
    setIntervalMinState(n);
    try {
      localStorage.setItem(WATCH_MINUTES_KEY, String(n));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setSoundsOnState(deskSoundsEnabled());
    try {
      const raw = localStorage.getItem(WATCH_MINUTES_KEY);
      if (raw) {
        const n = Number(raw);
        if (n >= 1 && n <= 60) setIntervalMinState(n);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSounds = useCallback(() => {
    const next = !deskSoundsEnabled();
    setDeskSoundsEnabled(next);
    setSoundsOnState(next);
  }, []);

  const appendRecorded = useCallback((ev: ScanStreamEvent) => {
    if (!recordableEvent(ev)) return;
    const next = [...recordedRef.current, ev];
    recordedRef.current =
      next.length > MAX_RECORDED ? next.slice(-MAX_RECORDED) : next;
  }, []);

  const applyEvent = useCallback(
    (raw: unknown, opts?: { fromReplay?: boolean }) => {
      const ev = raw as ScanStreamEvent;
      if (!ev || typeof ev !== "object" || !("type" in ev)) return;

      switch (ev.type) {
        case "scan_begin":
          if (ev.alertPrefs) {
            alertPrefsRef.current = {
              minTradeAlertConfidence: ev.alertPrefs.minTradeAlertConfidence,
              alertsHighConvictionOnly: ev.alertPrefs.alertsHighConvictionOnly,
            };
          }
          setSymbolProgress((prev) => {
            const next = { ...prev };
            for (const s of ev.symbols) next[s] = "queued";
            return next;
          });
          break;
        case "symbol_progress":
          setSymbolProgress((prev) => ({ ...prev, [ev.symbol]: ev.phase }));
          break;
        case "step":
          setSteps((s) => ({
            ...s,
            [ev.stepId]: ev.status as StepStatus,
          }));
          break;
        case "log":
          setLines((prev) => pushLine(prev, ev.message, ev.level));
          break;
        case "openai_start":
          setOpenAiSymbol(ev.symbol);
          setLines((prev) =>
            pushLine(prev, `OpenAI evaluating ${ev.symbol}…`, "info"),
          );
          break;
        case "openai_result": {
          setOpenAiSymbol(null);
          const tail =
            ev.decision === "NO_TRADE" && ev.no_trade_reason
              ? ` — ${ev.no_trade_reason.slice(0, 120)}`
              : "";
          setLines((prev) =>
            pushLine(
              prev,
              `${ev.symbol} → ${ev.decision}${
                ev.confidence != null ? ` confidence ${ev.confidence.toFixed(1)}` : ""
              }${tail}`,
              ev.decision === "TRADE" ? "ok" : "warn",
            ),
          );

          if (!opts?.fromReplay && deskSoundsEnabled() && ev.decision === "TRADE") {
            const minC = alertPrefsRef.current.minTradeAlertConfidence;
            const hi = alertPrefsRef.current.alertsHighConvictionOnly;
            const conf = ev.confidence;
            if (
              conf != null &&
              wouldMeetAlertThreshold(conf, minC, hi)
            ) {
              playAlertThresholdMet();
              setPulseHighlight(true);
              window.setTimeout(() => setPulseHighlight(false), 2200);
            } else if (
              conf != null &&
              isProminentConviction(conf, minC, hi)
            ) {
              playHighConvictionChime();
              setPulseHighlight(true);
              window.setTimeout(() => setPulseHighlight(false), 2200);
            }
          }
          break;
        }
        case "scan_metrics":
          setMetrics(ev.data);
          break;
        case "timing":
          break;
        case "summary":
          setSummary(ev.data);
          if (ev.data.timing) setMetrics(ev.data.timing);
          if (!opts?.fromReplay && deskSoundsEnabled()) {
            playScanCompleteTick();
            setPulseScanDone(true);
            window.setTimeout(() => setPulseScanDone(false), 1600);
          }
          break;
        case "complete":
          setLastSnapshot(ev.snapshot as unknown as ScannerSnapshot);
          setLastCompletedAt(new Date().toISOString());
          try {
            sessionStorage.setItem(
              EVENTS_STORAGE_KEY,
              JSON.stringify(recordedRef.current),
            );
          } catch {
            /* ignore */
          }
          break;
        case "error":
          setError(ev.message);
          break;
        default:
          break;
      }
    },
    [],
  );

  /** openai_result uses summary for threshold sounds — re-run when summary arrives after result (edge case). Acceptable if first TRADE misses sound once. */
  const applyEventRef = useRef(applyEvent);
  applyEventRef.current = applyEvent;

  const runScan = useCallback(
    async (opts?: { symbol?: string | null }) => {
      esRef.current?.close();
      esRef.current = null;

      setScanning(true);
      setError(null);
      setSteps({});
      setLines([]);
      setMetrics(null);
      recordedRef.current = [];

      const sym = opts?.symbol?.trim() || "";
      const url = `/api/scanner/stream${sym ? `?symbol=${encodeURIComponent(sym)}` : ""}`;

      await new Promise<void>((resolve) => {
        let endedClean = false;
        try {
          const es = new EventSource(url);
          esRef.current = es;

          es.onmessage = (event) => {
            try {
              const ev = JSON.parse(event.data) as ScanStreamEvent;
              appendRecorded(ev);
              applyEventRef.current(ev);
              if (ev.type === "complete" || ev.type === "error") {
                endedClean = true;
                es.close();
                esRef.current = null;
                setScanning(false);
                resolve();
              }
            } catch {
              setError("Malformed scan stream");
              es.close();
              esRef.current = null;
              setScanning(false);
              resolve();
            }
          };

          es.onerror = () => {
            if (esRef.current !== es) return;
            es.close();
            esRef.current = null;
            setScanning(false);
            if (!endedClean) {
              setError((prev) => prev ?? "Stream connection lost");
            }
            resolve();
          };
        } catch (e) {
          setScanning(false);
          setError(e instanceof Error ? e.message : String(e));
          resolve();
        }
      });
    },
    [appendRecorded],
  );

  useEffect(() => {
    if (watchMode !== "auto" || scanning) return;
    setCountdown(intervalMin * 60);
  }, [watchMode, intervalMin, scanning]);

  useEffect(() => {
    if (watchMode !== "auto" || scanning) return;
    const t = window.setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          void runScan();
          return intervalMin * 60;
        }
        return c - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [watchMode, scanning, intervalMin, runScan]);

  const deskStatus = useMemo((): DeskStatusChipState => {
    if (error) return "error";
    if (scanning && openAiSymbol) return "openai_evaluating";
    if (scanning) return "scanning";
    if (watchMode === "auto" && !scanning && countdown > 0) return "waiting_next";
    return "idle";
  }, [error, scanning, openAiSymbol, watchMode, countdown]);

  const replayLastStream = useCallback(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(EVENTS_STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    let arr: ScanStreamEvent[] = [];
    try {
      arr = JSON.parse(raw) as ScanStreamEvent[];
    } catch {
      return;
    }
    if (!Array.isArray(arr) || arr.length === 0) return;

    setError(null);
    setSteps({});
    setLines([]);
    setMetrics(null);
    setOpenAiSymbol(null);

    setScanning(true);
    arr.forEach((ev, i) => {
      window.setTimeout(() => {
        applyEventRef.current(ev, { fromReplay: true });
        if (i === arr.length - 1) {
          window.setTimeout(() => setScanning(false), 30);
        }
      }, i * 14);
    });
  }, []);

  return {
    scanning,
    steps,
    lines,
    summary,
    metrics,
    symbolProgress,
    lastSnapshot,
    lastCompletedAt,
    error,
    runScan,
    deskStatus,
    openAiSymbol,
    watchMode,
    setWatchMode,
    intervalMin,
    setIntervalMin,
    countdown,
    replayLastStream,
    pulseHighlight,
    pulseScanDone,
    soundsOn,
    toggleSounds,
  };
}

export type LiveDeskState = ReturnType<typeof useLiveDesk>;
