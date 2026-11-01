// Read-only, ADMIN-ONLY projection of the Pix test delivery outbox.
// No endpoint based on this projection can authorize/trigger Minecraft grants.
import type { PreviewDeliveryPlan } from "../delivery/rewardPlan.ts";

type RecordData = Record<string, unknown>;
export type PixTestDeliverySummary = {
  id: string;
  orderId: string;
  gamertag: string;
  kind: "items" | "vip" | "unconfigured";
  units: number;
  state: "pending" | "blocked" | "unknown";
  hold: "payment_not_verified" | "refunded" | "missing_approval_timestamp" |
    "reward_review_required" | "vip_mapping_required" |
    "reward_missing" | "reward_invalid" | "quantity_invalid" |
    "product_invalid" | "plan_missing" | "dispatch_disabled";
  dispatchEnabled: false;
  createdAt: string | null;
};
const safeString = (value: unknown, size: number) =>
  typeof value === "string" && value.length <= size ? value : null;

export function testDeliverySummary(id: string, job: RecordData, order?: RecordData | null): PixTestDeliverySummary {
  const plan = job.previewPlan && typeof job.previewPlan === "object"
    ? job.previewPlan as PreviewDeliveryPlan : null;
  const validId = /^[a-f0-9]{64}-\d{1,3}$/.test(id);
  const state = job.state === "pending" || job.state === "blocked"
    ? job.state : "unknown";
  const isRefunded = state === "blocked" ||
    order?.state === "refunded" || order?.state === "cancelled";
  let hold: PixTestDeliverySummary["hold"] =
    "payment_not_verified";
  if (isRefunded) hold = "refunded";
  else if (order?.state !== "approved" || !validId ||
           job.orderId !== id.split("-")[0] ||
           job.environment !== "test" ||
           job.dispatchEnabled !== false) hold = "payment_not_verified";
  else if (plan?.kind === "vip" && (job.requiresApprovalTimestamp === true || !job.approvedAt))
    hold = "missing_approval_timestamp";
  else if (!plan || plan.schema !== 1 || plan.readyForDispatch !== false)
    hold = "plan_missing";
  else if ([
    "reward_review_required", "vip_mapping_required", "reward_missing",
    "reward_invalid", "quantity_invalid", "product_invalid",
  ].includes(plan.blocker))
    hold = plan.blocker;
  else hold = "dispatch_disabled";
  return {
    id: validId ? id : "unknown",
    orderId: /^[a-f0-9]{64}$/.test(String(job.orderId)) ? String(job.orderId) : "unknown",
    gamertag: safeString(job.gamertag, 32) ?? "Jogador desconhecido",
    kind: plan?.kind === "items" || plan?.kind === "vip"
      ? plan.kind : "unconfigured",
    units: Number.isSafeInteger(plan?.units) && plan!.units >= 1 && plan!.units <= 64
      ? plan!.units : 0,
    state,
    hold,
    dispatchEnabled: false,
    createdAt: safeString(job.createdAt, 60),
  };
}
