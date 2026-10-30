import { ordersFixture } from "./fixtures/pixOrders.ts";
// Run only against the isolated demo emulator. Never writes to a live Firebase project.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { paymentDatabase } from "../server/payments/database.ts";
import { pixService } from "../server/payments/service.ts";
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8085");
const db = paymentDatabase();
await db.doc("products/pix-fixture").set({
  name: "Fixture local",
  price: 19.99,
  active: true,
  allowQuantity: true,
  maxQuantity: 5,
  rewardDraft: {
    version: 1,
    items: [{ itemId: "minecraft:diamond", quantity: 2 }],
  },
});
await db
  .doc("vips/pix-vip")
  .set({ name: "VIP local", price: 10, active: true, duration: "30 dias" });
await db.doc("coupons/fixture").set({
  code: "LOCALTEST",
  active: true,
  discountType: "percentage",
  discountValue: 10,
  maxUses: 1,
  usedCount: 0,
});
let provider: any;
let calls = 0;
const gateway: any = {
  me: async () => ({ id: 42, netcraftTestAccount: true }),
  create: async (body: any, key: string) => {
    calls++;
    provider = ordersFixture(body.external_reference, body.total_amount);
    return structuredClone(provider);
  },
  get: async () => structuredClone(provider),
};
const key = crypto.randomUUID(),
  id = crypto.createHash("sha256").update(key).digest("hex"),
  api = pixService(db, gateway);
const input = {
  lines: [
    { productId: "pix-fixture", productType: "product", quantity: 2 },
    { productId: "pix-vip", productType: "vip", quantity: 1 },
  ],
  gamertag: "Local Tester",
  email: "local@testuser.com",
  cpf: "12345678909",
  couponCode: "LOCALTEST",
};
const first = await api.create(input, key);
assert.equal(first.totalCents, 4498);
assert.equal(first.discountCents, 500);
assert.equal(first.state, "pending");
await api.create(input, key);
assert.equal(calls, 1);
provider = ordersFixture(first.id, "44.98", "approved");
await Promise.all([api.reconcile(id), api.reconcile(id), api.reconcile(id)]);
let jobs = await db
  .collection("pixTestDeliveries")
  .where("orderId", "==", id)
  .get();
assert.equal(jobs.size, 2);
for (const j of jobs.docs) {
  assert.equal(j.data().approvedAt, null);
  assert.equal(j.data().requiresApprovalTimestamp, true);
  assert.ok(j.data().approvalObservedAt);
  assert.equal(j.data().dispatchEnabled, false);
}
assert.equal((await db.doc("coupons/fixture").get()).data()!.usedCount, 0);
assert.equal(
  (await db.doc("pixTestCouponUsage/fixture").get()).data()!.reservedCount,
  1,
);
await assert.rejects(() => api.create(input, crypto.randomUUID()));
provider = { ...provider, total_amount: "0.01" };
await assert.rejects(() => api.reconcile(id));
assert.equal((await api.view(id)).state, "approved");
provider = ordersFixture(first.id, "44.98", "refunded");
await api.reconcile(id);
jobs = await db
  .collection("pixTestDeliveries")
  .where("orderId", "==", id)
  .get();
for (const j of jobs.docs) assert.equal(j.data().state, "blocked");
// REST client without credentials must not read or mutate private financial records.
for (const collection of [
  "pixTestOrders",
  "pixTestDeliveries",
  "pixTestCouponUsage",
]) {
  const url = `http://127.0.0.1:8085/v1/projects/demo-netcraft-admin-test/databases/(default)/documents/${collection}/unauthorized`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { state: { stringValue: "approved" } } }),
  });
  assert.equal(response.status, 403);
}
console.log(
  "PASS Firestore transactions, mixed cart, coupon reservation, concurrent duplicate approvals, private rules, refund outbox blocking",
);

const { emulatorDeliveryStore } = await import("../server/delivery/emulatorStore.ts");
const deliveryStore = emulatorDeliveryStore(db);
const demoId = "b".repeat(64) + "-0";
const demo = { id: demoId, gamertag: "OfflinePlayer", kind: "vip" as const, dispatchEnabled: false as const };
assert.equal((await deliveryStore.seed(demo)).duplicate, false);
assert.equal((await deliveryStore.seed(demo)).duplicate, true);
assert.equal((await deliveryStore.poll("SomeoneElse")).length, 0);
assert.equal((await deliveryStore.poll("OfflinePlayer")).length, 1);
assert.equal(await deliveryStore.retry(demoId), true);
const acks = await Promise.all([deliveryStore.acknowledge(demoId), deliveryStore.acknowledge(demoId)]);
assert.equal(acks.filter(a => !a.duplicate).length, 1);
assert.equal((await deliveryStore.poll("OfflinePlayer")).length, 0);
await deliveryStore.refund(demoId);
await assert.rejects(() => deliveryStore.acknowledge(demoId));
assert.equal((await deliveryStore.seed(demo)).state, "blocked");
console.log("PASS persistent demo delivery: duplicate seed, offline poll, retry, atomic ACK and refund block");

const express = (await import("express")).default;
const { createDeliverySimulationRouter } = await import("../server/routes/deliverySimulation.ts");
const signatureSecret = "emulator-simulation-secret-not-a-production-credential";
const app = express();
app.use(express.json());
app.use("/sim", createDeliverySimulationRouter({ secret: signatureSecret, store: deliveryStore }));
const server = app.listen(0, "127.0.0.1");
if (!server.listening) await new Promise<void>(resolve => server.once("listening", resolve));
const origin = "http://127.0.0.1:" + (server.address() as any).port;
async function signed(path: string, data: object, options: { bad?: boolean; replayNonce?: string } = {}) {
  const body = JSON.stringify(data);
  const timestamp = String(Date.now());
  const nonce = options.replayNonce || crypto.randomBytes(16).toString("hex");
  const payload = ["POST", path, timestamp, nonce, body].join("\n");
  const signature = crypto.createHmac("sha256", options.bad ? "wrong-secret" : signatureSecret).update(payload).digest("hex");
  const response = await fetch(origin + "/sim" + path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-nc-timestamp": timestamp,
      "x-nc-nonce": nonce, "x-nc-signature": signature },
    body,
  });
  return { status: response.status, data: await response.json() };
}
try {
  const httpId = "c".repeat(64) + "-0";
  const payload = { deliveryId: httpId, gamertag: "OfflineHTTP", kind: "kit",
    environment: "test", dispatchEnabled: false };
  assert.equal((await signed("/seed", payload, { bad: true })).status, 401);
  assert.equal((await signed("/seed", { ...payload, dispatchEnabled: true })).status, 400);
  assert.equal((await signed("/seed", payload)).status, 201);
  assert.equal((await signed("/seed", payload)).data.duplicate, true);
  assert.equal((await signed("/poll", { gamertag: "NoPlayer" })).data.deliveries.length, 0);
  assert.equal((await signed("/poll", { gamertag: "OfflineHTTP" })).data.deliveries.length, 1);
  assert.equal((await signed("/retry", { deliveryId: httpId })).data.retried, true);
  const responses = await Promise.all([
    signed("/ack", { deliveryId: httpId }),
    signed("/ack", { deliveryId: httpId }),
  ]);
  assert.equal(responses.filter(r => r.data.duplicate === false).length, 1);
  assert.equal((await signed("/poll", { gamertag: "OfflineHTTP" })).data.deliveries.length, 0);
  assert.equal((await signed("/refund", { deliveryId: httpId })).data.state, "blocked");
  assert.equal((await signed("/ack", { deliveryId: httpId })).status, 409);
  const replayNonce = crypto.randomBytes(16).toString("hex");
  const firstReplay = await signed("/poll", { gamertag: "OfflineHTTP" }, { replayNonce });
  assert.equal(firstReplay.status, 200);
  assert.equal((await signed("/poll", { gamertag: "OfflineHTTP" }, { replayNonce })).status, 401);
  console.log("PASS authenticated HTTP emulator delivery: HMAC, replay, offline poll, idempotency, concurrent ACK, retry and refund");
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
}

await db.terminate();
