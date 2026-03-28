/**
 * Live scan SSE: **GET** `/api/scanner/stream?symbol=AAPL` (EventSource-friendly) or **POST** with JSON `{ "symbol": "AAPL" }`.
 * Same event sequence for both.
 */
import { auth } from "@/auth";
import { executeScannerSnapshot } from "@/lib/queries/scanner-snapshot";
import type { LiveScanSummary, ScanStreamEvent } from "@/lib/scan/types";

export const runtime = "nodejs";

function sseLine(obj: ScanStreamEvent | Record<string, unknown>) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

async function scanStreamForUser(userId: string, symbol: string | undefined) {
  const encoder = new TextEncoder();
  const quoteMs: number[] = [];
  const symbolMs: number[] = [];
  const openAiMs: number[] = [];
  const t0 = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ScanStreamEvent | Record<string, unknown>) => {
        if (typeof e === "object" && e && "type" in e && e.type === "timing") {
          const t = e as Extract<ScanStreamEvent, { type: "timing" }>;
          if (t.kind === "quote") quoteMs.push(t.ms);
          else if (t.kind === "symbol") symbolMs.push(t.ms);
          else if (t.kind === "openai") openAiMs.push(t.ms);
        }
        controller.enqueue(encoder.encode(sseLine(e as ScanStreamEvent)));
      };

      try {
        const snap = await executeScannerSnapshot({
          userId,
          symbol,
          telemetry: (ev) => send(ev),
        });

        const wall = Date.now() - t0;
        const nSym = Math.max(1, snap.scanMeta.symbolsChecked);
        const timing = {
          wallClockMs: wall,
          avgSymbolMs: symbolMs.length ? mean(symbolMs) : wall / nSym,
          avgOpenAiMs: mean(openAiMs),
          openAiSamples: openAiMs.length,
          avgQuoteMs: mean(quoteMs),
          quoteSamples: quoteMs.length,
        };

        send({ type: "scan_metrics", data: timing });

        const summary: LiveScanSummary = {
          finishedAt: new Date().toISOString(),
          symbolsChecked: snap.scanMeta.symbolsChecked,
          passedToOpenAi: snap.scanMeta.passedToOpenAiGate,
          stockCandidates: snap.scanMeta.stockCandidateCount,
          optionCandidates: snap.scanMeta.optionCandidateCount,
          tradeDecisions: snap.scanMeta.tradeDecisionCount,
          openAiCalls: snap.scanMeta.openAiInvocations,
          tradeAlertsSentNote:
            "Alerts and simulated buys run in the scan worker / cron when a TRADE clears your notification threshold — not during this preview scan.",
          timing,
          minTradeAlertConfidence: snap.minTradeAlertConfidence,
          alertsHighConvictionOnly: snap.alertsHighConvictionOnly,
        };

        send({ type: "summary", data: summary });
        send({
          type: "complete",
          snapshot: JSON.parse(JSON.stringify(snap)) as Record<string, unknown>,
        });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const url = new URL(req.url);
  const raw = url.searchParams.get("symbol");
  const symbol = raw?.trim() ? raw.trim().toUpperCase() : undefined;
  return scanStreamForUser(session.user.id, symbol);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { symbol?: string | null } = {};
  try {
    body = (await req.json()) as { symbol?: string | null };
  } catch {
    body = {};
  }
  const raw = body.symbol;
  const symbol =
    raw != null && String(raw).trim() ? String(raw).trim().toUpperCase() : undefined;

  return scanStreamForUser(session.user.id, symbol);
}
