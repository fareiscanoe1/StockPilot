import { auth } from "@/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";

export default async function WatchlistPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const lists = await prisma.watchlist.findMany({
    where: { userId: session.user.id },
    include: { symbols: true },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Watchlist</h1>
      <div className="space-y-4">
        {lists.map((w) => (
          <div key={w.id} className="card p-4">
            <h2 className="font-medium">{w.name}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {w.symbols.map((s) => (
                <span
                  key={s.id}
                  className="rounded-md border border-[var(--border)] bg-black/30 px-2 py-1 font-mono text-xs"
                >
                  {s.symbol}
                  <span className="text-[var(--muted)]"> · {s.exchange}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
