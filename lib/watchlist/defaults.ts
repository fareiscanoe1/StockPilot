import prisma from "@/lib/db";

export const DEFAULT_WATCHLIST_NAMES = [
  "Main",
  "Earnings",
  "Options",
  "Income",
  "Crypto",
] as const;

export async function ensureDefaultWatchlists(userId: string): Promise<void> {
  const existing = await prisma.watchlist.findMany({
    where: { userId },
    select: { name: true },
  });
  const have = new Set(existing.map((w) => w.name.toLowerCase()));
  const missing = DEFAULT_WATCHLIST_NAMES.filter((name) => !have.has(name.toLowerCase()));
  if (!missing.length) return;
  await prisma.watchlist.createMany({
    data: missing.map((name) => ({ userId, name })),
    skipDuplicates: true,
  });
}
