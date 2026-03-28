import prisma from "@/lib/db";

type SymbolPreferenceRow = {
  userId: string;
  symbol: string;
  exchange: string;
  pinned: boolean;
  highPriority: boolean;
  muted: boolean;
  ignored: boolean;
  tags: string[];
};

type SymbolPreferenceDelegate = {
  findMany: (args: { where: { userId: string } }) => Promise<SymbolPreferenceRow[]>;
  upsert: (args: {
    where: {
      userId_symbol_exchange: { userId: string; symbol: string; exchange: string };
    };
    create: SymbolPreferenceRow;
    update: Record<string, unknown>;
  }) => Promise<SymbolPreferenceRow>;
};

function getDelegate(): SymbolPreferenceDelegate | null {
  const d = (prisma as unknown as { symbolPreference?: SymbolPreferenceDelegate })
    .symbolPreference;
  return d ?? null;
}

export function hasSymbolPreferenceModel(): boolean {
  return Boolean(getDelegate());
}

export async function findManySymbolPreferences(userId: string): Promise<SymbolPreferenceRow[]> {
  const d = getDelegate();
  if (!d) return [];
  return d.findMany({ where: { userId } });
}

export async function upsertSymbolPreferenceSafe(args: {
  where: {
    userId_symbol_exchange: { userId: string; symbol: string; exchange: string };
  };
  create: SymbolPreferenceRow;
  update: Record<string, unknown>;
}): Promise<SymbolPreferenceRow | null> {
  const d = getDelegate();
  if (!d) return null;
  return d.upsert(args);
}
