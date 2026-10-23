// The test checkout persists into pixTestOrders, separate from legacy orders.
// Export ONLY an allowlisted read-only projection; provider payloads, QR data,
// buyer identifiers and reward drafts must not be sent to the admin UI.
export interface PixTestOrderSummary {
  id: string;
  environment: "test";
  state: "creating" | "pending" | "processing" | "approved" | "expired" | "cancelled" | "refunded" | "unknown";
  gamertag: string;
  totalCents: number;
  linesCount: number;
  createdAt: string | null;
  approvedAt: string | null;
  approvalObservedAt: string | null;
  providerOrderId: string | null;
}

const states = new Set(["creating", "pending", "processing", "approved", "expired", "cancelled", "refunded"]);
const stringOrNull = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.length <= max ? value : null;

export function testOrderSummary(
  id: string,
  data: Record<string, unknown>,
): PixTestOrderSummary {
  const state = data.state;
  return {
    id,
    environment: "test",
    state: typeof state === "string" && states.has(state) ? state as PixTestOrderSummary["state"] : "unknown",
    gamertag: stringOrNull(data.gamertag, 32) ?? "Jogador desconhecido",
    totalCents: Number.isSafeInteger(data.totalCents) && Number(data.totalCents) >= 0
      ? Number(data.totalCents) : 0,
    linesCount: Array.isArray(data.lines) ? data.lines.length : 0,
    createdAt: stringOrNull(data.createdAt, 60),
    approvedAt: stringOrNull(data.approvedAt, 60),
    approvalObservedAt: stringOrNull(data.approvalObservedAt, 60),
    providerOrderId: stringOrNull(data.providerOrderId, 100),
  };
}
