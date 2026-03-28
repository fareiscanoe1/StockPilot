import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/commander");

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <p className="w-fit rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">
        Paper trading · live feeds · no auto-broker execution
      </p>
      <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
        AI Portfolio Commander
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-[var(--muted)]">
        One live command center for strict real-data scanning, opportunity ranking, risk signals,
        and proactive AI desk commentary.
      </p>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/sign-in?callbackUrl=/commander"
          className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-900/30"
        >
          Open command center
        </Link>
        <Link
          href="/sign-in?callbackUrl=/commander"
          className="rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm text-[var(--foreground)] hover:bg-white/5"
        >
          Create demo account
        </Link>
      </div>
      <ul className="mt-16 grid gap-6 text-sm text-[var(--muted)] md:grid-cols-3">
        <li className="card p-4">
          <strong className="block text-foreground">Unified live desk</strong>
          Scan, strategy controls, opportunities, portfolio, and AI conversation in one page.
        </li>
        <li className="card p-4">
          <strong className="block text-foreground">Adapter-first data</strong>
          Polygon, Finnhub, and OpenAI wired via environment — STRICT live data.
        </li>
        <li className="card p-4">
          <strong className="block text-foreground">Risk &amp; backtests</strong>
          Lockouts, heat limits, and historical replay modules included.
        </li>
      </ul>
    </div>
  );
}
