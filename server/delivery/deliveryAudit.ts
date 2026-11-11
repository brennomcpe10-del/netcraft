// Minimal, allowlisted diagnostic journal. Never accepts raw request bodies,
// payment payloads, usernames, emails, CPF, credentials, signatures or tokens.
// Lab candidate ONLY: the service creating this writer is disabled in Production.
import crypto from "node:crypto";

export const deliveryEvents = [
  "order_queued", "payment_blocked", "lease_offered", "lease_recovery",
  "lease_ack", "lease_nack_retry", "lease_manual_review", "refund_review",
  "provider_verification_failed", "manual_review_requested",
] as const;
export type DeliveryEvent = typeof deliveryEvents[number];
export const deliveryReasons = [
  "none","payment_not_confirmed","refund_or_chargeback","payment_disputed",
  "payment_cancelled","payment_expired","provider_check_failed",
  "stale_lease","ambiguous_delivery","player_offline","inventory_full",
  "inventory_unavailable","vip_not_configured","vip_not_loaded",
  "max_offers","payment_changed_after_offer","manual_refund_review",
  "recovery_receipt_required","payment_revoked","conflicting_snapshot",
] as const;
export type DeliveryReason = typeof deliveryReasons[number];

const digest = (id: string) => crypto.createHash("sha256").update(id).digest("hex");
export function publicDeliveryDiagnostic(record: any) {
  // Explicit safe projection. Never spread a Firestore document into an API
  // response or log: it contains payloads and private leaseTokens.
  const state = ["queued","leased","awaiting_receipt","acknowledged","blocked",
    "review_required","refunded_after_ack"].includes(record?.state)
    ? record.state : "unknown";
  return {
    state, dispatchEnabled: false as const,
    attempts: Number.isSafeInteger(record?.attempts) &&
      record.attempts >= 0 && record.attempts <= 20 ? record.attempts : 0,
    requiresReceipt: state === "leased" || state === "awaiting_receipt",
    requiresManualReview: state === "review_required" ||
      state === "refunded_after_ack",
    reason: deliveryReasons.includes(record?.reason) ? record.reason : "none",
  };
}
export function makeAuditRecord(input: {
  event: DeliveryEvent; reason?: DeliveryReason;
  orderId: string; deliveryId?: string; now: number;
}) {
  if (!deliveryEvents.includes(input.event) ||
      (input.reason && !deliveryReasons.includes(input.reason)) ||
      !/^[a-f0-9]{64}$/.test(input.orderId) ||
      (input.deliveryId && !/^[a-f0-9]{64}-(0|[1-9]\d{0,2})$/.test(input.deliveryId)) ||
      !Number.isSafeInteger(input.now))
    throw Error("invalid_delivery_audit");
  return {
    id: crypto.randomBytes(16).toString("hex"),
    record: {
      event: input.event,reason: input.reason || "none",
      orderHash: digest(input.orderId),
      deliveryHash: input.deliveryId ? digest(input.deliveryId) : null,
      recordedAt: new Date(input.now).toISOString(),
      environment: "commercial_candidate" as const,
      dispatchEnabled: false as const,
    },
  };
}
