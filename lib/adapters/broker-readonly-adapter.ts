/**
 * Placeholder for future read-only brokerage linkage (official APIs only).
 * Never implement screen-scraping or Wealthsimple credential flows.
 */
export interface BrokerReadOnlyAdapter {
  /** Health check — returns false until officially integrated */
  isConfigured(): boolean;
  /**
   * Positions / balances from broker — read-only.
   * MUST NOT place or route orders.
   */
  listExternalPositions?(): Promise<
    { symbol: string; qty: number; avgPrice: number }[]
  >;
}

export class BrokerReadOnlyStub implements BrokerReadOnlyAdapter {
  isConfigured() {
    return false;
  }
}
