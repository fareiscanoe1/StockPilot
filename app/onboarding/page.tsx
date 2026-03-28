import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in?callbackUrl=/onboarding");

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Welcome aboard</h1>
      <p className="mt-3 text-sm text-[var(--muted)]">
        Your virtual sub-portfolios and watchlist are seeded. Nothing here
        connects to Wealthsimple, Interactive Brokers, or any other broker
        unless you later add a read-only official integration.
      </p>
      <ol className="mt-8 list-decimal space-y-3 pl-5 text-sm text-[var(--muted)]">
        <li>Review strategy mode under Strategy settings.</li>
        <li>Configure Telegram/Discord under Notifications.</li>
        <li>Schedule POST <code>/api/cron/scan</code> with <code>CRON_SECRET</code>.</li>
      </ol>
      <Link
        href="/dashboard"
        className="mt-10 inline-block rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
