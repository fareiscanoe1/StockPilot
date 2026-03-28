import type { EarningsEvent } from "@prisma/client";

/** JSON-safe row for Client Components (no Prisma Decimal / Date). */
export type EarningsCacheRow = {
  id: string;
  symbol: string;
  exchange: string;
  companyName: string | null;
  datetimeUtc: string | null;
  fiscalDate: string | null;
  dataSource: string;
  epsEstimate: number | null;
  revenueEst: number | null;
  surprise: number | null;
  createdAt: string;
};

export function serializeEarningsEventsForClient(
  rows: EarningsEvent[],
): EarningsCacheRow[] {
  return rows.map((e) => ({
    id: e.id,
    symbol: e.symbol,
    exchange: e.exchange,
    companyName: e.companyName,
    datetimeUtc: e.datetimeUtc?.toISOString() ?? null,
    fiscalDate: e.fiscalDate?.toISOString() ?? null,
    dataSource: e.dataSource,
    epsEstimate: e.epsEstimate != null ? Number(e.epsEstimate) : null,
    revenueEst: e.revenueEst != null ? Number(e.revenueEst) : null,
    surprise: e.surprise != null ? Number(e.surprise) : null,
    createdAt: e.createdAt.toISOString(),
  }));
}
