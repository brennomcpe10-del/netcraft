import { test } from "node:test";
import assert from "node:assert/strict";
import { previewDeliveryPlan } from "../server/delivery/rewardPlan.ts";
import { testDeliverySummary } from "../server/payments/adminTestDeliveries.ts";

const orderId = "a".repeat(64);
const id = orderId + "-0";
const approved = { state: "approved" };
const kit = {
  productType: "product",
  productId: "farm-kit",
  quantity: 3,
  reward: {
    version: 1,
    items: [
      { itemId: "minecraft:diamond", quantity: 2 },
      { itemId: "minecraft:diamond", quantity: 1 },
      { itemId: "minecraft:iron_ingot", quantity: 4 },
    ],
  },
};
test("Paid kit snapshots compile multi-quantity item plan but cannot authorize a grant", () => {
  const plan = previewDeliveryPlan(kit);
  assert.equal(plan.kind, "items");
  assert.equal(plan.readyForDispatch, false);
  assert.equal(plan.blocker, "reward_review_required");
  assert.deepEqual(plan.items, [
    { itemId: "minecraft:diamond", quantity: 9 },
    { itemId: "minecraft:iron_ingot", quantity: 12 },
  ]);
  assert.equal("commands" in plan, false);
  assert.equal("payment" in plan, false);
  assert.equal("gamertag" in plan, false);
});
test("VIP purchases cannot start a timer from an observed-only approval date", () => {
  const plan = previewDeliveryPlan({
    productType: "vip", productId: "vip-explorer", quantity: 1, duration: "30 dias",
  });
  assert.equal(plan.kind, "vip");
  assert.equal(plan.vipDuration, "30 dias");
  assert.equal(plan.blocker, "vip_mapping_required");
  assert.equal(plan.readyForDispatch, false);
  const summary = testDeliverySummary(id, {
    orderId, gamertag: "Lab Tester", environment: "test",
    previewPlan: plan, approvedAt: null, approvalObservedAt: "2026-11-01T13:00:00Z",
    requiresApprovalTimestamp: true, dispatchEnabled: false, state: "pending",
  }, approved);
  assert.equal(summary.hold, "missing_approval_timestamp");
  assert.equal(summary.dispatchEnabled, false);
});
test("All absent, invalid and overly large reward plans are blocked, never executable", () => {
  assert.equal(previewDeliveryPlan({ productType: "product", productId: "kit", quantity: 1 }).blocker, "reward_missing");
  assert.equal(previewDeliveryPlan({ ...kit, quantity: 0 }).blocker, "quantity_invalid");
  assert.equal(previewDeliveryPlan({ ...kit, quantity: 65 }).blocker, "quantity_invalid");
  assert.equal(previewDeliveryPlan({ ...kit, productId: "../evil" }).blocker, "product_invalid");
  assert.equal(previewDeliveryPlan({ ...kit, reward: {
    version: 1, items: [{ itemId: "minecraft:diamond", quantity: 1000000 }],
  }}).blocker, "reward_invalid");
  assert.equal(previewDeliveryPlan({ ...kit, reward: {
    version: 1, items: [{ itemId: "minecraft:diamond", quantity: 2000 },
      { itemId: "minecraft:diamond", quantity: 2000 }],
  }}).blocker, "reward_review_required");
});
test("Admin summary requires a matching approved order, no mutation and no sensitive fields", () => {
  const plan = previewDeliveryPlan(kit);
  const job = { orderId, gamertag: "Lab Tester", environment: "test",
    previewPlan: plan, dispatchEnabled: false, state: "pending", attempts: 4,
    line: { reward: kit.reward },
    providerToken: "PRIVATE_TEST_TOKEN" };
  const pending = testDeliverySummary(id, job, { state: "pending" });
  assert.equal(pending.hold, "payment_not_verified");
  const ready = testDeliverySummary(id, job, approved);
  assert.equal(ready.hold, "reward_review_required");
  assert.equal(ready.kind, "items");
  assert.equal(ready.units, 3);
  assert.equal("previewPlan" in ready, false);
  assert.equal("line" in ready, false);
  assert.equal("providerToken" in ready, false);
  assert.equal(JSON.stringify(ready).includes("PRIVATE_TEST_TOKEN"), false);
  assert.equal(testDeliverySummary(id, job, {state:"refunded"}).hold, "refunded");
  assert.equal(testDeliverySummary(id, { ...job, state: "blocked" }, approved).hold, "refunded");
  assert.equal(testDeliverySummary(id, { ...job, dispatchEnabled: true }, approved).hold, "payment_not_verified");
  assert.equal(testDeliverySummary(id, { ...job, orderId: "f".repeat(64) }, approved).hold, "payment_not_verified");
  assert.equal(testDeliverySummary(id, { ...job, previewPlan: undefined }, approved).hold, "plan_missing");
  assert.equal(job.dispatchEnabled, false);
});
