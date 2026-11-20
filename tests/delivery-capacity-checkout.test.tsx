import { test } from "node:test";
import assert from "node:assert/strict";
import { previewDeliveryPlan } from "../server/delivery/rewardPlan.ts";
import { draftCoreDelivery } from "../server/delivery/coreJobContract.ts";
import { pixService } from "../server/payments/service.ts";
import { memoryDB } from "./fixtures/pixOrders.ts";

const ORDER = "a".repeat(64);
const reward = (items: {itemId:string;quantity:number}[]) => ({
  version: 1 as const, items,
});
const line = (items: {itemId:string;quantity:number}[], quantity = 1) => ({
  productType: "product", productId: "local-kit", quantity,
  reward: reward(items),
});

test("delivery compiler matches Core v0.3.1 2,304-unit and 36-item limits", () => {
  const good = previewDeliveryPlan(line([
    { itemId: "minecraft:diamond", quantity: 2300 },
    { itemId: "minecraft:iron_ingot", quantity: 4 },
  ]));
  assert.equal(good.kind, "items");
  assert.equal(good.blocker, "reward_review_required");
  assert.equal(good.items.reduce((n, item) => n + item.quantity, 0), 2304);

  const tooMany = previewDeliveryPlan(line([
    { itemId: "minecraft:diamond", quantity: 2300 },
    { itemId: "minecraft:iron_ingot", quantity: 5 },
  ]));
  assert.equal(tooMany.blocker, "reward_invalid");
  assert.deepEqual(tooMany.items, []);

  assert.equal(previewDeliveryPlan(line([
    { itemId: "minecraft:diamond", quantity: 1200 },
  ], 2)).blocker, "reward_invalid");

  assert.equal(previewDeliveryPlan(line(
    Array.from({ length: 37 }, (_, i) => ({
      itemId: "minecraft:test_item_" + i, quantity: 1,
    })),
  )).blocker, "reward_invalid");

  assert.equal(previewDeliveryPlan(line([
    { itemId: "custom:enchanted_chest", quantity: 1 },
  ])).blocker, "reward_invalid");

  const invalidDraft = draftCoreDelivery({
    deliveryId: ORDER + "-0", orderId: ORDER, gamertag: "Local Tester",
    environment: "test", orderState: "approved",
    plan: { ...good, items: [
      { itemId: "minecraft:diamond", quantity: 1400 },
      { itemId: "minecraft:iron_ingot", quantity: 1000 },
    ] },
  });
  assert.equal(invalidDraft.reason, "reward_review_required");
  assert.equal(invalidDraft.payload, null);
});

test("invalid configured kit is rejected before ANY Pix reservation or provider charge", async () => {
  for (const badReward of [
    reward([
      { itemId: "minecraft:diamond", quantity: 2300 },
      { itemId: "minecraft:iron_ingot", quantity: 5 },
    ]),
    reward([{ itemId: "custom:enchanted_chest", quantity: 1 }]),
  ]) {
    const db = memoryDB();
    db.records.set("products/local-kit", {
      id: "local-kit", name: "Laboratory kit", price: 10,
      active: true, rewardDraft: badReward,
    });
    let calls = 0;
    const gateway: any = {
      me: async () => ({ id: 42, netcraftTestAccount: true }),
      create: async () => { calls++; throw Error("should not POST"); },
    };
    const api = pixService(db as any, gateway);
    await assert.rejects(
      api.create({
        lines: [{ productId: "local-kit", productType: "product", quantity: 1 }],
        gamertag: "Lab Tester", email: "test@example.com", cpf: "12345678909",
      }, "invalid-reward-before-provider-12345"),
      (e: any) => e.status === 409 && /executor Minecraft/.test(e.message),
    );
    assert.equal(calls, 0);
    assert.equal([...db.records.keys()].filter(k =>
      k.startsWith("pixTestOrders/") || k.startsWith("pixTestDeliveries/") ||
      k.startsWith("pixTestCouponUsage/")).length, 0);
  }
});
