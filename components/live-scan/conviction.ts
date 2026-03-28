/** Match worker gating: optional min confidence + optional “high conviction only” (≥7). */
export function isProminentConviction(
  confidence: number,
  minTradeAlertConfidence: number | null,
  alertsHighConvictionOnly: boolean,
): boolean {
  if (alertsHighConvictionOnly && confidence < 7) return false;
  const floor = minTradeAlertConfidence ?? 7;
  return confidence >= floor;
}
