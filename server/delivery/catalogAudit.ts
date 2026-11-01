// Read-only admin audit. This is NOT an authorization to charge or grant rewards.
import type { Product, VIP, DeliveryCatalogAudit } from "../../src/types/index.ts";
import { maxQuantity } from "../../src/lib/cart.ts";
import { previewDeliveryPlan } from "./rewardPlan.ts";

export function auditDeliveryCatalog(products: Product[], vips: VIP[]): DeliveryCatalogAudit {
  const items: DeliveryCatalogAudit["items"] = [];
  for (const product of products) {
    if (product.active !== true) continue;
    const base = { id: String(product.id).slice(0,128), name: String(product.name).slice(0,120), kind: "product" as const };
    if (!product.rewardDraft) {
      items.push({ ...base, status: "reward_missing", maxQuantity: maxQuantity(product, "product") });
      continue;
    }
    const single = previewDeliveryPlan({
      productType: "product", productId: product.id, quantity: 1, reward: product.rewardDraft,
    });
    if (single.kind !== "items" || single.blocker !== "reward_review_required") {
      items.push({ ...base, status: "reward_invalid", maxQuantity: maxQuantity(product, "product") });
      continue;
    }
    const max = maxQuantity(product, "product");
    const largest = previewDeliveryPlan({
      productType: "product", productId: product.id, quantity: max, reward: product.rewardDraft,
    });
    items.push({
      ...base,
      maxQuantity: max,
      status: largest.kind === "items" && largest.blocker === "reward_review_required"
        ? "kit_lab_only" : "quantity_exceeds_executor",
    });
  }
  for (const vip of vips) {
    if (vip.active !== true) continue;
    items.push({ id: String(vip.id).slice(0,128), name: String(vip.name).slice(0,120),
      kind: "vip", maxQuantity: 1, status: "vip_mapping_required" });
  }
  const priority: Record<DeliveryCatalogAudit["items"][number]["status"], number> = {
    reward_invalid: 0, reward_missing: 1, quantity_exceeds_executor: 2,
    vip_mapping_required: 3, kit_lab_only: 4,
  };
  items.sort((a,b) => priority[a.status] - priority[b.status] || a.name.localeCompare(b.name));
  const counts = {
    reward_invalid: items.filter(x => x.status === "reward_invalid").length,
    reward_missing: items.filter(x => x.status === "reward_missing").length,
    quantity_exceeds_executor: items.filter(x => x.status === "quantity_exceeds_executor").length,
    vip_mapping_required: items.filter(x => x.status === "vip_mapping_required").length,
    kit_lab_only: items.filter(x => x.status === "kit_lab_only").length,
  };
  return {
    environment: "preview",
    realPaymentsEnabled: false,
    minecraftDispatchEnabled: false,
    totalActive: items.length,
    counts,
    truncated: items.length > 100,
    items: items.slice(0,100),
  };
}
