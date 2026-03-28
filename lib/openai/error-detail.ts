type OpenAiErrorLike = {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  code?: unknown;
  type?: unknown;
  param?: unknown;
  request_id?: unknown;
  headers?: unknown;
  error?: unknown;
  response?: unknown;
};

export type OpenAiErrorDetail = {
  name: string;
  message: string;
  status: number | null;
  code: string | null;
  type: string | null;
  param: string | null;
  requestId: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

export function extractOpenAiErrorDetail(err: unknown): OpenAiErrorDetail {
  const e = asRecord(err) as OpenAiErrorLike | null;
  const nested = asRecord(e?.error);
  const response = asRecord(e?.response);
  const responseData = asRecord(response?.data);
  const responseErr = asRecord(responseData?.error);

  const status =
    asNumber(e?.status) ??
    asNumber(response?.status) ??
    asNumber(nested?.status) ??
    asNumber(responseErr?.status);

  const message =
    asString(e?.message) ??
    asString(nested?.message) ??
    asString(responseErr?.message) ??
    "Unknown OpenAI error";

  const code =
    asString(e?.code) ?? asString(nested?.code) ?? asString(responseErr?.code);

  const type =
    asString(e?.type) ?? asString(nested?.type) ?? asString(responseErr?.type);

  const param =
    asString(e?.param) ?? asString(nested?.param) ?? asString(responseErr?.param);

  const requestId =
    asString(e?.request_id) ??
    asString(asRecord(e?.headers)?.["x-request-id"]) ??
    asString(asRecord(response?.headers)?.["x-request-id"]);

  return {
    name: asString(e?.name) ?? "OpenAIError",
    message,
    status,
    code,
    type,
    param,
    requestId,
  };
}

export function summarizeOpenAiError(detail: OpenAiErrorDetail): string {
  const tags: string[] = [];
  if (detail.status != null) tags.push(`status=${detail.status}`);
  if (detail.code) tags.push(`code=${detail.code}`);
  if (detail.type) tags.push(`type=${detail.type}`);
  if (detail.param) tags.push(`param=${detail.param}`);
  if (detail.requestId) tags.push(`request_id=${detail.requestId}`);
  const tagStr = tags.length ? `${tags.join(" ")} ` : "";
  return `${tagStr}${detail.message}`.trim();
}

export function logOpenAiError(scope: string, err: unknown): OpenAiErrorDetail {
  const detail = extractOpenAiErrorDetail(err);
  console.error(`[openai:${scope}] ${summarizeOpenAiError(detail)}`);
  return detail;
}
