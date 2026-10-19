// Run only against the isolated demo emulator. Never writes to a live Firebase project.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { paymentDatabase } from "../server/payments/database.ts";
import { pixService } from "../server/payments/service.ts";
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8085");
const db = paymentDatabase();
await db
  .doc("products/pix-fixture")
  .set({
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
await db
  .doc("coupons/fixture")
  .set({
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
  me: async () => ({ id: 42 }),
  create: async (body: any, key: string) => {
    calls++;
    provider = {
      id: 123,
      collector_id: 42,
      payment_method_id: "pix",
      live_mode: false,
      currency_id: "BRL",
      status: "pending",
      date_approved: null,
      ...body,
      point_of_interaction: {
        transaction_data: {
          qr_code: "local-only-fixture",
          qr_code_base64: "aGVsbG8=",
        },
      },
    };
    return provider;
  },
  get: async () => provider,
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
provider = {
  ...provider,
  status: "approved",
  date_approved: "2026-10-19T01:00:00Z",
};
await Promise.all([api.reconcile(id), api.reconcile(id), api.reconcile(id)]);
let jobs = await db
  .collection("pixTestDeliveries")
  .where("orderId", "==", id)
  .get();
assert.equal(jobs.size, 2);
for (const j of jobs.docs) {
  assert.equal(j.data().approvedAt, "2026-10-19T01:00:00.000Z");
  assert.equal(j.data().dispatchEnabled, false);
}
assert.equal((await db.doc("coupons/fixture").get()).data()!.usedCount, 0);
assert.equal((await db.doc("pixTestCouponUsage/fixture").get()).data()!.reservedCount, 1);
await assert.rejects(() => api.create(input, crypto.randomUUID()));
provider = { ...provider, transaction_amount: 0.01 };
await assert.rejects(() => api.reconcile(id));
assert.equal((await api.view(id)).state, "approved");
provider = {
  ...provider,
  transaction_amount: 44.98,
  status: "refunded",
  transaction_amount_refunded: 44.98,
};
await api.reconcile(id);
jobs = await db
  .collection("pixTestDeliveries")
  .where("orderId", "==", id)
  .get();
for (const j of jobs.docs) assert.equal(j.data().state, "blocked");
// REST client without credentials must not read or mutate private financial records.
for (const collection of ["pixTestOrders", "pixTestDeliveries", "pixTestCouponUsage"]) {
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
await db.terminate();
