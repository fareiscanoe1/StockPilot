import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <p className="w-fit rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">
        Paper trading · live feeds · no auto-broker execution
      </p>
      <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
        Earnings Pilot AI
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-[var(--muted)]">
        A paper desk with live market data, multi-factor scoring, and alerts — mirror ideas in
        your real account only if you choose, on your side.
      </p>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/sign-in"
          className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-900/30"
        >
          Sign in
        </Link>
        <Link
          href="/sign-in"
          className="rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm text-[var(--foreground)] hover:bg-white/5"
        >
          Create demo account
        </Link>
      </div>
      <ul className="mt-16 grid gap-6 text-sm text-[var(--muted)] md:grid-cols-3">
        <li className="card p-4">
          <strong className="block text-foreground">Adapter-first data</strong>
          Polygon, Finnhub, and OpenAI wired via environment — STRICT live data.
        </li>
        <li className="card p-4">
          <strong className="block text-foreground">Explainable AI logs</strong>
          Facts are labeled separately from model inference in the journal.
        </li>
        <li className="card p-4">
          <strong className="block text-foreground">Risk &amp; backtests</strong>
          Lockouts, heat limits, and historical replay modules included.
        </li>
      </ul>
    </div>
  );
}
