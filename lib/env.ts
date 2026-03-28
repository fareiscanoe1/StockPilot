import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
  DATABASE_URL: z
    .string()
    .optional()
    .default(
      "postgresql://earnings:earnings@localhost:5432/earnings_pilot",
    ),
  AUTH_SECRET: z
    .string()
    .optional()
    .default("dev-insecure-change-me-32chars!!"),
  NEXTAUTH_URL: z.string().url().optional(),
  /** STRICT = real vendor data only; missing keys disable features (no mock fallback). */
  DATA_PROVIDER: z
    .union([z.literal("STRICT"), z.string()])
    .optional()
    .transform((v) => {
      if (v != null && v !== "" && v !== "STRICT") {
        console.warn(`[env] Unsupported DATA_PROVIDER="${v}" — enforcing STRICT.`);
      }
      return "STRICT" as const;
    }),
  POLYGON_API_KEY: z.string().optional(),
  FINNHUB_API_KEY: z.string().optional(),
  /** Web search layer for latest context (optional) */
  TAVILY_API_KEY: z.string().optional(),
  /** Required for AI trade reasoning — never used as market data */
  OPENAI_API_KEY: z.string().optional(),
  /** Chat model for structured trade JSON (default: gpt-4o-mini) */
  OPENAI_REASONING_MODEL: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  /** Optional SMS webhook / Twilio — interface only until configured */
  SMS_WEBHOOK_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.warn("[env] validation warnings", parsed.error.flatten().fieldErrors);
  }
  return envSchema.parse(process.env);
}

export const env = parseEnv();
