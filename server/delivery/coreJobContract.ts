// NetCraftCore v2.2.7-compatible draft from a server-verified Pix TEST outbox.
// No execution authority, no public endpoint and no network side effects.
// The v2.2.7 executor must never execute this draft without the future
// authenticated, transactionally leased delivery bridge.
import type { PreviewDeliveryPlan } from "./rewardPlan.ts";
export type CoreDeliveryPayload = {
  contract: "netcraft.delivery.v1";
  id: string;
  orderId: string;
  gamertag: string;
  kind: "items";
  items: Array<{ itemId: string; quantity: number }>;
};
export type CoreDeliveryDraft = {
  schema: 1;
  executable: false;
  dispatchEnabled: false;
  reason: "payment_not_approved" | "invalid_snapshot" |
    "vip_mapping_required" | "reward_review_required" | "bridge_not_connected";
  payload: CoreDeliveryPayload | null;
};
export function draftCoreDelivery(input: {
  deliveryId: string;
  orderId: string;
  gamertag: string;
  orderState: string;
  environment: string;
  plan: PreviewDeliveryPlan | null;
}): CoreDeliveryDraft {
  const no = (reason: CoreDeliveryDraft["reason"]): CoreDeliveryDraft => ({
    schema: 1, executable: false, dispatchEnabled: false, reason, payload: null,
  });
  if (input.environment !== "test" || input.orderState !== "approved")
    return no("payment_not_approved");
  if (!/^[a-f0-9]{64}$/.test(input.orderId) ||
      !/^[a-f0-9]{64}-[0-9]{1,3}$/.test(input.deliveryId) ||
      input.deliveryId.split("-")[0] !== input.orderId ||
      !/^[A-Za-z0-9_ ]{1,32}$/.test(input.gamertag) ||
      input.gamertag.trim() !== input.gamertag)
    return no("invalid_snapshot");
  const p = input.plan;
  if (!p || p.schema !== 1 || p.readyForDispatch !== false)
    return no("invalid_snapshot");
  if (p.kind === "vip") return no("vip_mapping_required");
  if (p.kind !== "items" || p.blocker !== "reward_review_required" ||
      !Array.isArray(p.items) || p.items.length < 1 || p.items.length > 36)
    return no("reward_review_required");
  const items = new Map<string, number>();
  for (const item of p.items) {
    if (!item || !/^minecraft:[a-z0-9_]+$/.test(item.itemId) ||
        !Number.isSafeInteger(item.quantity) || item.quantity < 1 ||
        item.quantity > 2304) return no("reward_review_required");
    const count = (items.get(item.itemId) ?? 0) + item.quantity;
    if (count > 2304) return no("reward_review_required");
    items.set(item.itemId, count);
  }
  if (items.size > 36) return no("reward_review_required");
  return { schema: 1, executable: false, dispatchEnabled: false,
    reason: "bridge_not_connected",
    payload: { contract: "netcraft.delivery.v1",
      id: input.deliveryId, orderId: input.orderId, gamertag: input.gamertag,
      kind: "items",
      items: [...items].sort(([a], [b]) => a.localeCompare(b))
        .map(([itemId, quantity]) => ({ itemId, quantity })),
    },
  };
}
