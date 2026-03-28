# Earnings Pilot AI — setup guide

## Prerequisites

- Node.js 20+
- Docker (optional, for local PostgreSQL + Redis)

## 1. Install dependencies

```bash
cd earnings-pilot-ai
npm install
```

## 2. Database

### Option A: Docker Compose

Run this **exactly** (one line, no extra words — shells treat `#` as a comment only if it appears correctly):

```bash
docker compose up -d postgres
```

Wait a few seconds, then confirm:

```bash
docker compose ps
```

You should see `postgres` running and port `5432` published.

### Option B: Your own Postgres

Set `DATABASE_URL` to your connection string.

## 3. Environment variables

### Where to put secrets

| What | Where |
|------|--------|
| **Primary file** | **`earnings-pilot-ai/.env`** — same folder as `package.json` (create this file yourself; it is **gitignored**). |
| **Optional overrides** | **`.env.local`** — same folder. Next.js and `npm run db:*` load **`.env` first**, then **`.env.local`**; duplicate names in **`.env.local` win**. Do **not** put empty `POLYGON_API_KEY=""` / `FINNHUB_API_KEY=""` in **`.env.local`** or they override real values in **`.env`**. |
| **Format** | One variable per line: `NAME="value"` (use quotes for API keys). |
| **Reload** | Restart `npm run dev` after editing env vars. |

Minimal **`.env`** (keys only is fine — defaults in `lib/env.ts` supply `DATABASE_URL`, `AUTH_SECRET`, and `DATA_PROVIDER=STRICT` if omitted):

```env
POLYGON_API_KEY="your_polygon_key"
FINNHUB_API_KEY="your_finnhub_token"
OPENAI_API_KEY="your_openai_key"
```

Add when needed:

```env
DATABASE_URL="postgresql://earnings:earnings@localhost:5432/earnings_pilot"
AUTH_SECRET="long-random-string-min-32-chars"
NEXTAUTH_URL="http://localhost:3000"
DATA_PROVIDER="STRICT"
TAVILY_API_KEY=""
OPENAI_REASONING_MODEL="gpt-4o-mini"
CRON_SECRET="your-cron-bearer-secret"
```

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Long random string in production (NextAuth) |
| `NEXTAUTH_URL` | e.g. `http://localhost:3000` (must match dev port) |
| `DATA_PROVIDER` | `STRICT` (required): real APIs only; missing keys disable features (no mock data) |
| `POLYGON_API_KEY` | US stocks, aggregates, **options chains** |
| `FINNHUB_API_KEY` | Quotes if no Polygon, **earnings calendar**, **general + company news** |
| `TAVILY_API_KEY` | **Web search** snippets merged into scanner rationale (optional) |
| `OPENAI_API_KEY` | **Structured trade reasoning** (JSON in/out); not used for market data |
| `OPENAI_REASONING_MODEL` | Optional Chat Completions model (default `gpt-4o-mini`) |
| `CRON_SECRET` | Bearer token for `POST /api/cron/scan` |
| `TELEGRAM_BOT_TOKEN` | Bot token for Telegram alerts |
| `SMTP_*` / `EMAIL_FROM` | Outbound email |
| `SMS_WEBHOOK_URL` | Optional generic SMS bridge (your provider) |

## 4. Prisma

```bash
npm run db:push
npm run db:generate
npm run db:seed
```

## 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with the seeded demo user (see README).

## 6. Autonomous scan (background)

**HTTP (recommended for Vercel/cron):**

```bash
curl -X POST "http://localhost:3000/api/cron/scan" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Optional single user:

```bash
curl -X POST "http://localhost:3000/api/cron/scan?userId=USER_CUID" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**CLI worker:**

```bash
npm run worker:scan -- USER_CUID
```

### Celery / Redis (optional extension)

This repo uses **cron + HTTP or CLI** by default. To add Celery:

1. Define Redis URL in env.
2. Move `ScanRunner.runForUser` into a Celery task module.
3. Point your beat schedule at that task.

The **Redis** service in `docker-compose.yml` is provided for that pattern; it is not required for the default flow.

## 7. Live data (AUTO mode)

1. Set `DATA_PROVIDER=STRICT` in `.env` (or rely on the app default).
2. Add `POLYGON_API_KEY` (stocks + options) and `FINNHUB_API_KEY` (earnings + news; also quote fallback).
3. Optionally add `TAVILY_API_KEY` for open-web context in the strategy engine.

Check **Settings** in the app for the resolved data stack summary.

**Always verify** vendor licensing, rate limits, delayed vs real-time data, and exchange coverage (US vs Canada).

## Troubleshooting

### `no such service: #`

You pasted a comment in a way the shell or Docker treated as a service name. Run **only**:

```bash
docker compose up -d postgres
```

### `cp: ... is not a directory`

Usually `cp` received **too many arguments**. Create **`earnings-pilot-ai/.env`** in your editor instead of copying from a template file.

### `P1001: Can't reach database server at localhost:5432`

- Postgres is not running → start Docker: `docker compose up -d postgres`.
- Or `DATABASE_URL` points at the wrong DB (e.g. old `mydb` in `.env`) → set the URL above in **`.env.local`** (or `.env`) and run `npm run db:push` again.

### Dev server uses port 3003

Something else is using `3000`. Either use the URL Next prints (e.g. `http://localhost:3003`) or free the port:

```bash
lsof -i :3000
```

## 8. Production notes

- Rotate `AUTH_SECRET` and `CRON_SECRET`.
- Use `prisma migrate` for managed schema changes instead of `db:push` where appropriate.
- Run `next build` in CI; ensure `DATABASE_URL` is available at runtime for server routes.
