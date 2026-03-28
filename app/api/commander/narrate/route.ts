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

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    digest: CommanderScanDigest | null;
    prefs: CommanderPrefs;
    heuristicSummary: string;
  };

  if (!body.heuristicSummary?.trim()) {
    return NextResponse.json({ error: "heuristicSummary required" }, { status: 400 });
  }

  const key = env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({
      narrative: null,
      openAiUsed: false,
      blockedReason: "OPENAI_API_KEY missing — showing heuristic summary only.",
    });
  }

  const client = new OpenAI({ apiKey: key });
  const model = env.OPENAI_REASONING_MODEL ?? "gpt-4o-mini";

  const sys = `You are a disciplined desk analyst for a STRICT real-data paper trading app. 
You only reference facts present in the JSON digest and the heuristic summary. 
Never invent prices, symbols not in digest, or fake fills. 
Write 2 short paragraphs in plain English: (1) what matters now, (2) how the user's strategy toggles change emphasis. 
If digest is empty or scan incomplete, say so clearly.`;

  const user = JSON.stringify({
    prefs: body.prefs,
    digest: body.digest,
    heuristicSummary: body.heuristicSummary,
  });

  try {
    const res = await client.chat.completions.create({
      model,
      temperature: 0.35,
      max_tokens: 450,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    });
    const narrative = res.choices[0]?.message?.content?.trim() ?? null;
    return NextResponse.json({ narrative, openAiUsed: true, blockedReason: null });
  } catch (e) {
    const detail = logOpenAiError("commander.narrate", e);
    const lower = summarizeOpenAiError(detail).toLowerCase();
    const friendly = lower.includes("429") || detail.status === 429
      ? "OpenAI quota/rate limit hit — showing strict heuristic summary until quota is restored."
      : lower.includes("401") ||
          detail.status === 401 ||
          lower.includes("invalid api key")
        ? "OpenAI authentication failed — verify OPENAI_API_KEY."
        : `OpenAI narrate failed: ${summarizeOpenAiError(detail).slice(0, 260)}`;
    const debugError =
      env.NODE_ENV === "development" ? extractOpenAiErrorDetail(e) : undefined;
    return NextResponse.json({
      narrative: null,
      openAiUsed: false,
      blockedReason: friendly,
      debugError,
    });
  }
}
