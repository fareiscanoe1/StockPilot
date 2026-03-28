import { NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/auth";
import { env } from "@/lib/env";
import {
  extractOpenAiErrorDetail,
  logOpenAiError,
  summarizeOpenAiError,
} from "@/lib/openai/error-detail";

export const runtime = "nodejs";

async function isAuthorized(req: Request): Promise<boolean> {
  const session = await auth();
  if (session?.user?.id) return true;

  // In local development, allow easy diagnostics without auth cookies.
  if (env.NODE_ENV !== "production") return true;

  const bearer = req.headers.get("authorization");
  if (env.CRON_SECRET && bearer === `Bearer ${env.CRON_SECRET}`) return true;
  return false;
}

function parseBodyMaybe(raw: string | null): { model?: string; prompt?: string } {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as { model?: string; prompt?: string };
    return parsed ?? {};
  } catch {
    return {};
  }
}

async function runTest(modelInput?: string, promptInput?: string) {
  const key = env.OPENAI_API_KEY;
  const model = modelInput?.trim() || env.OPENAI_REASONING_MODEL?.trim() || "gpt-4o-mini";

  if (!key) {
    return {
      ok: false as const,
      status: 500,
      payload: {
        ok: false,
        keyLoaded: false,
        model,
        failureReason: "OPENAI_API_KEY is missing in server environment.",
      },
    };
  }

  const client = new OpenAI({ apiKey: key });
  const prompt = promptInput?.trim() || "Reply with exactly: OPENAI_OK";
  try {
    const startedAt = Date.now();
    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 24,
      messages: [{ role: "user", content: prompt }],
    });
    return {
      ok: true as const,
      status: 200,
      payload: {
        ok: true,
        keyLoaded: true,
        model,
        elapsedMs: Date.now() - startedAt,
        response: completion.choices[0]?.message?.content?.trim() ?? null,
        usage: completion.usage ?? null,
      },
    };
  } catch (e) {
    const detail = logOpenAiError("api.test-openai", e);
    return {
      ok: false as const,
      status: detail.status && detail.status >= 400 ? detail.status : 502,
      payload: {
        ok: false,
        keyLoaded: true,
        model,
        failureReason: summarizeOpenAiError(detail),
        error: extractOpenAiErrorDetail(e),
      },
    };
  }
}

export async function GET(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const model = url.searchParams.get("model") ?? undefined;
  const prompt = url.searchParams.get("prompt") ?? undefined;
  const result = await runTest(model, prompt);
  return NextResponse.json(result.payload, { status: result.status });
}

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let raw: string | null = null;
  try {
    raw = await req.text();
  } catch {
    raw = null;
  }
  const body = parseBodyMaybe(raw);
  const result = await runTest(body.model, body.prompt);
  return NextResponse.json(result.payload, { status: result.status });
}
