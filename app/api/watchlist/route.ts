import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/db";
import { ensureDefaultWatchlists } from "@/lib/watchlist/defaults";
import type { SymbolCategoryTag } from "@prisma/client";
import {
  findManySymbolPreferences,
  hasSymbolPreferenceModel,
  upsertSymbolPreferenceSafe,
} from "@/lib/symbol-preferences";

export const runtime = "nodejs";

const TAGS: SymbolCategoryTag[] = [
  "AGGRESSIVE",
  "DEFENSIVE",
  "INCOME",
  "OPTIONS",
  "CRYPTO",
  "EARNINGS",
];

function normalizeTagList(input: unknown): SymbolCategoryTag[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<SymbolCategoryTag>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const t = raw.trim().toUpperCase();
    if (TAGS.includes(t as SymbolCategoryTag)) out.add(t as SymbolCategoryTag);
  }
  return [...out];
}

function normalizeSymbol(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim().toUpperCase();
  if (!v) return null;
  if (!/^[A-Z0-9.\-:]{1,24}$/.test(v)) return null;
  return v;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureDefaultWatchlists(session.user.id);

  const [lists, prefs] = await Promise.all([
    prisma.watchlist.findMany({
      where: { userId: session.user.id },
      include: { symbols: true },
      orderBy: { name: "asc" },
    }),
    findManySymbolPreferences(session.user.id),
  ]);

  const prefBySymbol = new Map(
    prefs.map((p) => [
      `${p.symbol}:${p.exchange}`.toUpperCase(),
      {
        pinned: p.pinned,
        highPriority: p.highPriority,
        muted: p.muted,
        ignored: p.ignored,
        tags: p.tags,
      },
    ]),
  );

  const merged = lists.map((w) => ({
    ...w,
    symbols: w.symbols.map((s) => {
      const pref =
        prefBySymbol.get(`${s.symbol}:${s.exchange}`.toUpperCase()) ??
        prefBySymbol.get(`${s.symbol}:US`.toUpperCase()) ??
        null;
      return {
        ...s,
        pinned: pref?.pinned ?? false,
        highPriority: pref?.highPriority ?? false,
        muted: pref?.muted ?? false,
        ignored: pref?.ignored ?? false,
        tags: pref?.tags ?? [],
      };
    }),
  }));
  return NextResponse.json({ watchlists: merged, preferences: prefs });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    watchlistId?: string;
    symbol?: string;
    exchange?: string;
    name?: string;
    pinned?: boolean;
    highPriority?: boolean;
    muted?: boolean;
    ignored?: boolean;
    tags?: string[];
  };
  if (body.name && !body.watchlistId) {
    const name = body.name.trim() || "Main";
    const wl = await prisma.watchlist.upsert({
      where: { userId_name: { userId: session.user.id, name } },
      create: { userId: session.user.id, name },
      update: {},
    });
    return NextResponse.json({ watchlist: wl });
  }
  const symbol = normalizeSymbol(body.symbol);
  if (!body.watchlistId || !symbol) {
    return NextResponse.json({ error: "watchlistId and symbol required" }, { status: 400 });
  }
  const ownWatchlist = await prisma.watchlist.findFirst({
    where: { id: body.watchlistId, userId: session.user.id },
    select: { id: true },
  });
  if (!ownWatchlist) {
    return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
  }
  const exchange = (body.exchange ?? "US").toUpperCase();
  const tags = normalizeTagList(body.tags);
  const row = await prisma.watchlistSymbol.upsert({
    where: {
      watchlistId_symbol_exchange: {
        watchlistId: body.watchlistId,
        symbol,
        exchange,
      },
    },
    create: {
      watchlistId: body.watchlistId,
      symbol,
      exchange,
    },
    update: {},
  });
  const pref = await upsertSymbolPreferenceSafe({
    where: {
      userId_symbol_exchange: {
        userId: session.user.id,
        symbol,
        exchange,
      },
    },
    create: {
      userId: session.user.id,
      symbol,
      exchange,
      pinned: body.pinned ?? false,
      highPriority: body.highPriority ?? false,
      muted: body.muted ?? false,
      ignored: body.ignored ?? false,
      tags,
    },
    update: {
      pinned: body.pinned ?? undefined,
      highPriority: body.highPriority ?? undefined,
      muted: body.muted ?? undefined,
      ignored: body.ignored ?? undefined,
      tags: tags.length ? tags : undefined,
    },
  });
  return NextResponse.json({
    symbol: row,
    preference: pref,
    preferenceModelAvailable: hasSymbolPreferenceModel(),
  });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    watchlistId?: string;
    watchlistName?: string;
    symbol?: string;
    exchange?: string;
    removeSymbol?: boolean;
    pinned?: boolean;
    highPriority?: boolean;
    muted?: boolean;
    ignored?: boolean;
    tags?: string[];
  };

  if (body.watchlistId && typeof body.watchlistName === "string" && !body.symbol) {
    const ownWatchlist = await prisma.watchlist.findFirst({
      where: { id: body.watchlistId, userId: session.user.id },
      select: { id: true },
    });
    if (!ownWatchlist) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }
    const updated = await prisma.watchlist.update({
      where: { id: body.watchlistId },
      data: { name: body.watchlistName.trim() || "Main" },
    });
    return NextResponse.json({ watchlist: updated });
  }

  const symbol = normalizeSymbol(body.symbol);
  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }
  const exchange = (body.exchange ?? "US").toUpperCase();

  if (body.removeSymbol && body.watchlistId) {
    const ownWatchlist = await prisma.watchlist.findFirst({
      where: { id: body.watchlistId, userId: session.user.id },
      select: { id: true },
    });
    if (!ownWatchlist) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }
    await prisma.watchlistSymbol.deleteMany({
      where: {
        watchlistId: body.watchlistId,
        symbol,
        exchange,
      },
    });
  }

  const prefUpdate: Record<string, unknown> = {};
  if (typeof body.pinned === "boolean") prefUpdate.pinned = body.pinned;
  if (typeof body.highPriority === "boolean") prefUpdate.highPriority = body.highPriority;
  if (typeof body.muted === "boolean") prefUpdate.muted = body.muted;
  if (typeof body.ignored === "boolean") prefUpdate.ignored = body.ignored;
  if (body.tags !== undefined) prefUpdate.tags = normalizeTagList(body.tags);

  const pref =
    Object.keys(prefUpdate).length > 0
      ? await upsertSymbolPreferenceSafe({
          where: {
            userId_symbol_exchange: {
              userId: session.user.id,
              symbol,
              exchange,
            },
          },
          create: {
            userId: session.user.id,
            symbol,
            exchange,
            pinned: Boolean(prefUpdate.pinned),
            highPriority: Boolean(prefUpdate.highPriority),
            muted: Boolean(prefUpdate.muted),
            ignored: Boolean(prefUpdate.ignored),
            tags: (prefUpdate.tags as SymbolCategoryTag[] | undefined) ?? [],
          },
          update: prefUpdate,
        })
      : null;

  return NextResponse.json({
    ok: true,
    preference: pref,
    preferenceModelAvailable: hasSymbolPreferenceModel(),
  });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    watchlistId?: string;
    symbol?: string;
    exchange?: string;
    deleteWatchlist?: boolean;
  };
  if (body.deleteWatchlist && body.watchlistId) {
    await prisma.watchlist.deleteMany({
      where: { id: body.watchlistId, userId: session.user.id },
    });
    return NextResponse.json({ ok: true });
  }

  const symbol = normalizeSymbol(body.symbol);
  if (!body.watchlistId || !symbol) {
    return NextResponse.json({ error: "watchlistId and symbol required" }, { status: 400 });
  }
  const ownWatchlist = await prisma.watchlist.findFirst({
    where: { id: body.watchlistId, userId: session.user.id },
    select: { id: true },
  });
  if (!ownWatchlist) {
    return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
  }
  await prisma.watchlistSymbol.deleteMany({
    where: {
      watchlistId: body.watchlistId,
      symbol,
      exchange: (body.exchange ?? "US").toUpperCase(),
    },
  });
  return NextResponse.json({ ok: true });
}
