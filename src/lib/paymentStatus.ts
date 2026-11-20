import type { OrderStatus } from "../types/index.ts";
export function paymentStatusPatch(
  current: {
    status?: unknown;
    paidAt?: unknown;
    refundedAmount?: unknown;
    amount?: unknown;
  },
  status: OrderStatus,
  now: string,
) {
  const patch: Record<string, unknown> = { status, updatedAt: now };
  // Delivery is not an approval event. Old paid records keep an unknown date.
  if (
    status === "Pago" &&
    !current.paidAt &&
    !["Pago", "Entregue", "Reembolsado", "Estornado"].includes(
      String(current.status),
    )
  ) {
    patch.paidAt = now;
    patch.approvalSource = "admin_confirmation";
  }
  if (status === "Entregue") patch.deliveredAt = now;
  if (status === "Reembolsado" || status === "Estornado")
    patch.refundedAt = now;
  return patch;
}
