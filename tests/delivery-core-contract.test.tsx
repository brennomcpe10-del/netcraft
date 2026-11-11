import { test } from "node:test";
import assert from "node:assert/strict";
import { draftCoreDelivery } from "../server/delivery/coreJobContract.ts";
import { previewDeliveryPlan } from "../server/delivery/rewardPlan.ts";
const orderId = "a".repeat(64);
const plan = previewDeliveryPlan({ productType: "product",
  productId: "kit-diamante", quantity: 2,
  reward: { version: 1, items: [
    { itemId: "minecraft:diamond", quantity: 3 },
    { itemId: "minecraft:iron_ingot", quantity: 8 },
  ] },
});
const example = { deliveryId: orderId + "-0", orderId, gamertag: "Lab Tester",
  orderState: "approved", environment: "test", plan };
test("approved test Pix snapshot produces exact inert Core 2.2.7 item contract", () => {
  const res = draftCoreDelivery(example);
  assert.equal(res.executable, false);
  assert.equal(res.dispatchEnabled, false);
  assert.equal(res.reason, "bridge_not_connected");
  assert.deepEqual(res.payload, { contract: "netcraft.delivery.v1",
    id: example.deliveryId, orderId, gamertag: "Lab Tester", kind: "items",
    items: [{ itemId: "minecraft:diamond", quantity: 6 },
      { itemId: "minecraft:iron_ingot", quantity: 16 }] });
});
test("pending/refunded/production/wrong IDs never produce a delivery payload", () => {
  for (const override of [
    { orderState: "pending" }, { orderState: "refunded" },
    { environment: "production" }, { deliveryId: orderId + "-notindex" },
    { orderId: "b".repeat(64) }, { gamertag: "../admin" }
  ]) {
    const res = draftCoreDelivery({ ...example, ...override });
    assert.equal(res.payload, null);
    assert.equal(res.executable, false);
  }
});
test("VIP requires explicit mapped rank before any payload is created", () => {
  const vip = draftCoreDelivery({ ...example,
    plan: previewDeliveryPlan({ productType: "vip",
      productId: "explorer", quantity: 1, duration: "30 dias" }) });
  assert.equal(vip.reason, "vip_mapping_required");
  assert.equal(vip.payload, null);
});
test("invalid/custom rewards are not silently passed to Core executor", () => {
  const custom = draftCoreDelivery({ ...example,
    plan: previewDeliveryPlan({ productType: "product",
      productId: "special", quantity: 1,
      reward: { version: 1, items: [{ itemId: "ncbr:gem", quantity: 2 }] } }) });
  assert.equal(custom.reason, "reward_review_required");
  assert.equal(custom.payload, null);
  assert.equal(draftCoreDelivery({ ...example, plan: null }).payload, null);
});
