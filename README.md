# Earnings Pilot AI

AI-assisted **paper trading** desk: virtual portfolios, multi-factor scoring, scheduled scans, and alerts (in-app, email, Telegram, Discord, SMS hook). **No brokerage order routing** — every execution is simulated and logged.

**Repository path:** `earnings-pilot-ai/` (inside your `FINANCE` workspace).

### Project layout (high level)

```
earnings-pilot-ai/
├── app/
│   ├── (app)/           # Logged-in shell: dashboard, scanner, portfolio, …
│   ├── api/             # REST: auth, cron, scanner, stream (SSE), backtest, …
│   ├── sign-in/
│   ├── onboarding/
│   ├── layout.tsx
│   ├── page.tsx         # Landing
│   └── globals.css
├── components/          # Sidebar, chart, simulated banner, SSE client
├── lib/
│   ├── adapters/        # Market, options, earnings, news, notifications, broker stub
│   ├── engines/         # Strategy, risk, portfolio, alerts, journal, backtest, scan
│   ├── queries/         # Shared server queries (e.g. scanner snapshot)
│   ├── strategies/     # Example strategy copy
│   ├── db.ts
│   └── env.ts
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── workers/
│   └── scan-runner.ts   # CLI entry for cron/systemd
├── docker-compose.yml
├── README.md
└── SETUP.md
```

---

## Feasibility and scope (read first)

### 1. What is fully buildable now

- Full **Next.js 15** app shell (landing, auth, onboarding, dashboard, scanner, earnings, options, portfolio, positions, history, AI rationale, analytics, settings, notifications, strategy, watchlist).
- **PostgreSQL** schema (Prisma) for users, virtual accounts / sub-portfolios, watchlists, holdings, simulated orders & fills, option contracts, alerts, notifications, recommendation logs, earnings events, news items, backtests, audit logs.
- **Adapter interfaces** for market, options, earnings, news — **STRICT real-data mode only** (`DATA_PROVIDER=STRICT`): **Polygon** (preferred) or **Finnhub** for quotes/candles, **Polygon-only** options chains, **Finnhub** earnings + news, optional **Tavily** open-web context (`lib/adapters/*`, `lib/adapters/strict-providers.ts`, `provider-factory.ts`).
- **Engines:** `StrictStrategyEngine` (OpenAI structured JSON reasoning), `RiskEngine`, `PortfolioSimulator`, `AlertEngine`, `TradeJournal`, `BacktestEngine`, `ScanRunner`; heuristic reference in `lib/engines/scoring.ts`.
- **Notifications:** in-app + SSE (`/api/stream/alerts`), email via SMTP (nodemailer), Telegram bot API, Discord webhooks, optional SMS via configurable webhook URL (`lib/adapters/notification-adapter.ts`).
- **API routes** for dashboard data, scanner, cron-triggered autonomous scan, backtests, prefs, etc.
- **TradingView Lightweight Charts™**-style component (`components/PriceChart.tsx`).
- **Background execution:** `POST /api/cron/scan` (Bearer `CRON_SECRET`) or `npm run worker:scan -- <userId>`.

### 2. What needs paid third-party data APIs

- **US equities / options / aggregates:** Polygon.io (or similar) — tiered pricing; options chains and earnings endpoints may require specific product levels.
- **Earnings calendar / some fundamentals / news:** Finnhub (or equivalent); full-market earnings sweeps often require paid tiers.
- **Canadian listings:** depend on vendor coverage (e.g. TSX symbols in Polygon; verify exchange suffixes and licensing).
- **Analyst revision streams, full macro calendars, historical options marks** for realistic options backtests: typically separate premium datasets.

With **`DATA_PROVIDER=STRICT`** (required), the desk never uses mock or synthetic **market** data. **Polygon** is used when `POLYGON_API_KEY` is set (quotes, candles, **real options chains**). Otherwise **Finnhub** supplies supported real endpoints (quote, candles via stock candle API, **stock bid/ask**, earnings calendar, news, fundamentals). If a required input is missing, the strategy returns **`NO_TRADE`** with a reason code — scans do not simulate trades on fabricated data. **Tavily** (`TAVILY_API_KEY`) adds **optional open-web research** only; it is labeled separately and does **not** replace quotes, earnings, fundamentals, or options.

### 3. Strict real-data mode (STRICT)

- The app **does not** use mock, placeholder, or fallback-generated market data.
- **Trades are blocked** when required live data is unavailable (e.g. no quote, no bid/ask, insufficient candles, no Polygon chain for options mode, no earnings row for earnings-hunter on that symbol).
- **Polygon** is **required** for real **options** chains; without it, options scanning and options trades are **disabled**.
- **Finnhub** backs **real** stock endpoints used here: quotes, bid/ask, candles, **earnings calendar**, **news**, and **fundamentals** (metric endpoint) where applicable.
- **Tavily** is **optional** and **supplemental** — open-web context only, not market data.
- **`RecommendationLog`** stores **`TRADE` / `NO_TRADE`**, **`reasonCode`**, **`sourcesUsed`**, **`sourcesMissing`**, and payloads with **exact provenance** (quotes, candles, earnings, news, options, web research).
- **OpenAI** (`OPENAI_API_KEY`) is the **reasoning and decision layer only**: the engine sends a **normalized `provider_snapshot`** (Polygon/Finnhub/Tavily-labeled fields) and requires a **strict JSON schema** response: `decision`, `confidence`, `risk_score`, `thesis`, `invalidation`, `rationale`, `no_trade_reason`. OpenAI is **never** consulted for quotes, candles, earnings, news, fundamentals, or options — those remain vendor-only. Without `OPENAI_API_KEY`, symbols that pass data gates still log **`NO_TRADE`** with `OPENAI_REASONING_UNAVAILABLE`.
- The UI shows a **REAL DATA ONLY** badge, the **active provider stack** on scanner and dashboard (alerts) areas, and per-row **provenance** on scanner candidates where applicable.

### 4. What is still heuristic (not vendor data)

- **Sentiment** from Finnhub articles uses vendor-provided fields when present; otherwise news scoring is **skipped**, not invented.
- **“Implied vs historical earnings move”**, **vol regime labels**, and **balance-sheet quality scores** in the strategy path are **heuristic placeholders** unless you plug in vendor-specific fields.
- **BacktestEngine** uses daily closes and simple rules; **options-aware** historical simulation needs stored historical chains and premiums.
- **Web push** channel is reserved in the schema; browser push requires VAPID/service worker work not scaffolded here.
- **Sharpe-like / advanced attribution** metrics: structure exists in schema (`realizedPnl`, `maxDrawdownPct`, etc.) but full analytics formulas are intentionally minimal until you define methodology.

### 5. What is intentionally out of scope (safety)

- **No** connection to Wealthsimple, IBKR, or any broker for **trade execution**.
- **No** scraping of brokerage logins, passwords, 2FA, or screen-scraping “roboadvisor” flows.
- **`BrokerReadOnlyAdapter`** is a **stub** — any future read-only sync must use an **official, documented API** and explicit user consent.
- Treat the **real account as external**; alerts explicitly state **simulated execution only**.

---

## Architecture (modules)

| Module | Path |
|--------|------|
| MarketDataAdapter | `lib/adapters/market-data-adapter.ts` |
| OptionsDataAdapter | `lib/adapters/options-data-adapter.ts` |
| EarningsDataAdapter | `lib/adapters/earnings-data-adapter.ts` |
| NewsAdapter | `lib/adapters/news-adapter.ts` |
| NotificationAdapter | `lib/adapters/notification-adapter.ts` |
| BrokerReadOnlyAdapter (placeholder) | `lib/adapters/broker-readonly-adapter.ts` |
| StrictStrategyEngine | `lib/engines/strategy-engine.ts` |
| OpenAI reasoning (structured JSON) | `lib/engines/openai-reasoning.ts` |
| RiskEngine | `lib/engines/risk-engine.ts` |
| PortfolioSimulator | `lib/engines/portfolio-simulator.ts` |
| AlertEngine | `lib/engines/alert-engine.ts` |
| TradeJournal | `lib/engines/trade-journal.ts` |
| BacktestEngine | `lib/engines/backtest-engine.ts` |
| ScanRunner / scheduler hook | `lib/engines/scan-runner.ts`, `app/api/cron/scan/route.ts`, `workers/scan-runner.ts` |

**STRICT mode:** set `DATA_PROVIDER=STRICT` and API keys (see [SETUP.md](./SETUP.md)). DTOs label real rows with `source: "POLYGON"` / `"FINNHUB"` / `"TAVILY"` (research only).

---

## Quick start

See **[SETUP.md](./SETUP.md)** for Docker Postgres, env vars, migrations/seed, cron, and provider keys.

### Env files

Create **`earnings-pilot-ai/.env`** (gitignored) with your API keys and any overrides. See **[SETUP.md](./SETUP.md)** for the variable list. Optional **`.env.local`** overrides **`.env`** for the same variable names — do not leave empty key lines in **`.env.local`** or they will clear values from **`.env`**.

`DATABASE_URL`, `AUTH_SECRET`, and `DATA_PROVIDER` have defaults in code if omitted; add them to **`.env`** when you need non-defaults.

Demo seed user: `demo@earningspilot.ai` / `demo-demo-demo`.

---

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production |
| `npm run db:generate` | Prisma client |
| `npm run db:push` | Push schema (dev) |
| `npm run db:seed` | Seed demo user + virtual accounts |
| `npm run worker:scan -- <userId>` | Run `ScanRunner` for one user |

---

## License

Apache-2.0 for **Lightweight Charts** usage per TradingView terms. Application code: use and modify per your needs.

---

## Disclaimer

This software is for **education and simulation**. It is **not** investment advice. Model outputs mix **facts** (quotes, dates from providers) with **inference** (scores, thesis text). Past backtests do not guarantee future results.
