// Compiles server-side, immutable preview-only reward instructions from a paid
// order snapshot. This is NOT an authorization to grant anything in Minecraft.
// The trusted executor and reward approval registry do not exist yet.
import { validateRewardDraft } from "../../src/lib/rewardDraft.ts";

export type PreviewDeliveryPlan = {
  schema: 1;
  kind: "items" | "vip" | "unconfigured";
  units: number;
  readyForDispatch: false;
  blocker: "reward_review_required" | "vip_mapping_required" |
    "reward_missing" | "reward_invalid" | "quantity_invalid" | "product_invalid";
  items: Array<{ itemId: string; quantity: number }>;
  vipProductId: string | null;
  vipDuration: string | null;
};

export function previewDeliveryPlan(line: unknown): PreviewDeliveryPlan {
  const obj = line && typeof line === "object" && !Array.isArray(line)
    ? line as Record<string, unknown> : {};
  const units = obj.quantity;
  const base = {
    schema: 1 as const,
    kind: "unconfigured" as "items" | "vip" | "unconfigured",
    units: Number.isSafeInteger(units) ? units as number : 0,
    readyForDispatch: false as const,
    blocker: "product_invalid" as PreviewDeliveryPlan["blocker"],
    items: [] as PreviewDeliveryPlan["items"],
    vipProductId: null as string | null,
    vipDuration: null as string | null,
  };
  if (!Number.isSafeInteger(units) || (units as number) < 1 || (units as number) > 64)
    return { ...base, blocker: "quantity_invalid" };
  if (typeof obj.productId !== "string" || !/^[a-zA-Z0-9_.-]{1,128}$/.test(obj.productId))
    return { ...base, blocker: "product_invalid" };
  if (obj.productType === "vip") {
    // VIP rank/tag and actual start/end timestamp must be mapped/verified by
    // a separate server-side registry before dispatch can ever be enabled.
    return {
      ...base, kind: "vip", blocker: "vip_mapping_required",
      vipProductId: obj.productId,
      vipDuration: typeof obj.duration === "string" && obj.duration.length <= 80
        ? obj.duration : null,
    };
  }
  if (obj.productType !== "product") return base;
  if (!obj.reward) return { ...base, blocker: "reward_missing" };
  try {
    validateRewardDraft(obj.reward as any);
    const reward = obj.reward as { items: Array<{ itemId: string; quantity: number }> };
    if (!Array.isArray(reward.items) || reward.items.length === 0)
      return { ...base, blocker: "reward_missing" };
    const grants = new Map<string, number>();
    for (const item of reward.items) {
      const total = item.quantity * (units as number);
      const next = (grants.get(item.itemId) ?? 0) + total;
      // Keep plans bounded, even when catalog permits a larger editorial draft.
      if (!Number.isSafeInteger(next) || next > 2304 * 64)
        return { ...base, blocker: "reward_invalid" };
      grants.set(item.itemId, next);
    }
    return {
      ...base, kind: "items", blocker: "reward_review_required",
      items: [...grants].map(([itemId, quantity]) => ({ itemId, quantity })),
    };
  } catch {
    return { ...base, blocker: "reward_invalid" };
  }
}
