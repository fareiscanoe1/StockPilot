import { NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/auth";
import { env } from "@/lib/env";
import type { CommanderScanDigest } from "@/lib/commander/digest";
import type { CommanderPrefs } from "@/lib/commander/types";
import {
  extractOpenAiErrorDetail,
  logOpenAiError,
  summarizeOpenAiError,
} from "@/lib/openai/error-detail";

export const runtime = "nodejs";

type CommandTraceStep = {
  label: string;
  status: "done" | "blocked" | "failed";
  detail: string;
};

function intentFromMessage(message: string): string {
  const m = message.toLowerCase();
  if (/\bcompare\b.+\bvs\b/.test(m)) return "comparison";
  if (/\bincome\b|\bdividend\b/.test(m)) return "income search";
  if (/\bdefensive\b|\bsafer\b/.test(m)) return "defensive search";
  if (/\boptions\b/.test(m)) return "options search";
  if (/\bcrypto\b/.test(m)) return "crypto search";
  if (/\baggressive\b|\bmomentum\b/.test(m)) return "aggressive search";
  if (/\bbest\b|\btrade\b/.test(m)) return "best-idea query";
  return "general desk query";
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    message: string;
    digest: CommanderScanDigest | null;
    prefs: CommanderPrefs;
  };
  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }
  const trace: CommandTraceStep[] = [
    {
      label: "Parse request",
      status: "done",
      detail: `Intent classified as ${intentFromMessage(message)}.`,
    },
  ];

  if (body.digest) {
    trace.push({
      label: "Verify real-data context",
      status: "done",
      detail: `Providers: quotes=${body.digest.dataSources.quotes}, options=${body.digest.dataSources.options}, earnings=${body.digest.dataSources.earnings}, reasoning=${body.digest.dataSources.reasoning}.`,
    });
    trace.push({
      label: "Rank candidates",
      status: "done",
      detail: `${body.digest.decisions.length} decisions, ${
        body.digest.decisions.filter((d) => d.decision === "TRADE").length
      } TRADE decision(s), ${
        body.digest.candidates.filter((c) => c.assetType === "OPTION").length
      } option candidate(s).`,
    });
  } else {
    trace.push({
      label: "Verify real-data context",
      status: "blocked",
      detail: "No digest supplied from latest scan.",
    });
    trace.push({
      label: "Rank candidates",
      status: "blocked",
      detail: "Cannot rank without scan digest.",
    });
  }

  if (!body.digest) {
    trace.push({
      label: "OpenAI reasoning",
      status: "blocked",
      detail: "No live scan digest available for a grounded answer.",
    });
    return NextResponse.json({
      answer:
        "No live scan context yet. Run a foreground scan first, then retry your command so the answer is grounded in real provider data.",
      openAiUsed: false,
      blockedReason: "No scan digest supplied",
      trace,
    });
  }

  const key = env.OPENAI_API_KEY;
  if (!key) {
    trace.push({
      label: "OpenAI reasoning",
      status: "blocked",
      detail: "OPENAI_API_KEY missing.",
    });
    return NextResponse.json({
      answer:
        "OpenAI is not configured. Set OPENAI_API_KEY and retry (you can validate with /api/test-openai).",
      openAiUsed: false,
      blockedReason: "OpenAI API key missing",
      trace,
    });
  }

  const client = new OpenAI({ apiKey: key });
  const model = env.OPENAI_REASONING_MODEL ?? "gpt-4o-mini";

  const sys = `You answer live desk questions for a STRICT real-data scanner. 
Only use the JSON digest and prefs. If information is missing, say exactly what is missing. 
Never invent prices or symbols not listed. Keep under 180 words.`;

  const user = `User question: ${message}\n\nPrefs:\n${JSON.stringify(body.prefs)}\n\nDigest:\n${JSON.stringify(body.digest)}`;

  try {
    const res = await client.chat.completions.create({
      model,
      temperature: 0.25,
      max_tokens: 400,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    });
    const answer = res.choices[0]?.message?.content?.trim() ?? "OpenAI returned an empty response.";
    trace.push({
      label: "OpenAI reasoning",
      status: "done",
      detail: `Model ${model} returned a response.`,
    });
    return NextResponse.json({ answer, openAiUsed: true, blockedReason: null, trace });
  } catch (e) {
    const detail = logOpenAiError("commander.chat", e);
    const lower = summarizeOpenAiError(detail).toLowerCase();
    const friendly = lower.includes("429") || detail.status === 429
      ? "OpenAI quota/rate limit hit."
      : lower.includes("401") ||
          detail.status === 401 ||
          lower.includes("invalid api key")
        ? "OpenAI auth failed — verify OPENAI_API_KEY."
        : `OpenAI request failed: ${summarizeOpenAiError(detail).slice(0, 260)}`;
    trace.push({
      label: "OpenAI reasoning",
      status: "failed",
      detail: friendly,
    });
    const debugError =
      env.NODE_ENV === "development" ? extractOpenAiErrorDetail(e) : undefined;
    return NextResponse.json({
      answer: `Command blocked: ${friendly}`,
      openAiUsed: false,
      blockedReason: friendly,
      trace,
      debugError,
    });
  }
}
