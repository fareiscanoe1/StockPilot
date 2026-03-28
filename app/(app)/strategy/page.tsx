import { auth } from "@/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { exampleStrategies } from "@/lib/strategies/examples";
import { revalidatePath } from "next/cache";
import type { StrategyMode } from "@prisma/client";

const modes: StrategyMode[] = [
  "AGGRESSIVE",
  "BALANCED",
  "DEFENSIVE",
  "EARNINGS_HUNTER",
  "OPTIONS_MOMENTUM",
  "CUSTOM",
];

export default async function StrategyPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const profile = await prisma.strategyProfile.findUnique({
    where: { userId: session.user.id },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Strategy settings</h1>
        <p className="text-sm text-[var(--muted)]">
          Active mode:{" "}
          <strong className="text-foreground">{profile?.mode ?? "BALANCED"}</strong>
        </p>
      </div>

      <form
        action={async (fd: FormData) => {
          "use server";
          const session = await auth();
          if (!session?.user?.id) return;
          const mode = fd.get("mode") as StrategyMode;
          await prisma.strategyProfile.upsert({
            where: { userId: session.user.id },
            create: { userId: session.user.id, mode },
            update: { mode },
          });
          revalidatePath("/strategy");
        }}
        className="card max-w-md space-y-3 p-4"
      >
        <label className="text-xs text-[var(--muted)]">
          Core mode
          <select
            name="mode"
            defaultValue={profile?.mode ?? "BALANCED"}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-black/30 px-3 py-2 text-sm"
          >
            {modes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
        >
          Save mode
        </button>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        {exampleStrategies.map((s) => (
          <div key={s.mode} className="card p-4 text-sm">
            <h2 className="font-medium text-foreground">{s.title}</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{s.description}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-[var(--muted)]">
              {s.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
