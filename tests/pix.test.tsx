import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  testToken,
  webhookSignature,
  verifyPayment,
  paymentState,
  MercadoPago,
} from "../server/payments/mercadoPago.ts";
import { discounted, pixService } from "../server/payments/service.ts";
const order = { id: "order", paymentId: "123", totalCents: 2500 };
const payment = {
  id: 123,
  external_reference: "order",
  collector_id: 42,
  currency_id: "BRL",
  payment_method_id: "pix",
  live_mode: false,
  transaction_amount: 25,
  metadata: { netcraft_order_id: "order" },
  status: "approved",
  date_approved: "2026-10-19T02:00:00Z",
};
test("Pix fails closed for production and non-test tokens", () => {
  assert.throws(() =>
    testToken({
      VERCEL_ENV: "production",
      MERCADOPAGO_ACCESS_TOKEN: "TEST-test",
    }),
  );
  assert.throws(() =>
    testToken({ MERCADOPAGO_ACCESS_TOKEN: "APP_USR-secret" }),
  );
  assert.equal(
    testToken({ MERCADOPAGO_ACCESS_TOKEN: "TEST-test" }),
    "TEST-test",
  );
});
test("payment must match receiver, amount, currency, order, method, metadata and environment", () => {
  verifyPayment(payment, order, "42");
  for (const change of [
    { collector_id: 43 },
    { transaction_amount: 24.99 },
    { currency_id: "USD" },
    { external_reference: "other" },
    { payment_method_id: "card" },
    { metadata: {} },
    { live_mode: true },
    { id: 124 },
    { date_approved: null },
  ])
    assert.throws(() => verifyPayment({ ...payment, ...change }, order, "42"));
});
test("webhook validates signature and rejects stale, missing and modified messages", () => {
  const ts = String(Date.now());
  const sig = crypto
    .createHmac("sha256", "secret")
    .update(`id:123;request-id:req;ts:${ts};`)
    .digest("hex");
  assert.equal(
    webhookSignature("123", "req", `ts=${ts},v1=${sig}`, "secret"),
    true,
  );
  assert.equal(
    webhookSignature("124", "req", `ts=${ts},v1=${sig}`, "secret"),
    false,
  );
  assert.equal(
    webhookSignature(
      "123",
      "req",
      `ts=${ts},v1=${sig}`,
      "secret",
      Date.now() + 600000,
    ),
    false,
  );
  assert.equal(webhookSignature("123", "req", "", ""), false);
});
test("status handles expiration, cancellation and refunds", () => {
  assert.equal(paymentState(payment), "approved");
  assert.equal(
    paymentState({ ...payment, transaction_amount_refunded: 1 }),
    "refunded",
  );
  assert.equal(
    paymentState({ status: "pending", date_of_expiration: "2000-01-01" }),
    "expired",
  );
  assert.equal(paymentState({ status: "cancelled" }), "cancelled");
  assert.equal(paymentState({ status: "pending" }), "pending");
});
test("coupon cents, limits, expiry and minimum are server checked", () => {
  const c = { active: true, discountType: "percentage", discountValue: 10 };
  assert.equal(discounted(2599, c), 260);
  assert.equal(
    discounted(2599, { ...c, discountType: "fixed", discountValue: 100 }),
    2599,
  );
  for (const bad of [
    { active: false },
    { expiresAt: "2000-01-01" },
    { maxUses: 1, usedCount: 1 },
    { minOrderValue: 30 },
    { discountValue: 101 },
  ])
    assert.throws(() => discounted(2599, { ...c, ...bad }));
});
test("official API transport uses idempotency header, timeout and bearer only on backend", async () => {
  let request: any;
  const g = new MercadoPago("TEST-fixture", async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 123 }), { status: 201 });
  });
  await g.create({ transaction_amount: 25 }, "same-key");
  assert.equal(request.url, "https://api.mercadopago.com/v1/payments");
  assert.equal(request.options.headers["X-Idempotency-Key"], "same-key");
  assert.equal(request.options.headers.Authorization, "Bearer TEST-fixture");
});
// Transactional adapter exercises the service including retry and outbox without real payments.
function memoryDB() {
  const records = new Map<string, any>();
  const ref = (path: string): any => ({
    path,
    id: path.split("/").pop(),
    get: async () => snap(path),
  });
  const snap = (path: string): any => ({
    exists: records.has(path),
    id: path.split("/").pop(),
    ref: ref(path),
    data: () => structuredClone(records.get(path)),
  });
  const tx: any = {
    get: async (r: any) => snap(r.path),
    create: (r: any, d: any) => {
      assert.ok(!records.has(r.path));
      records.set(r.path, structuredClone(d));
    },
    update: (r: any, d: any) =>
      records.set(r.path, { ...records.get(r.path), ...structuredClone(d) }),
  };
  return {
    records,
    collection: (c: string) => ({ doc: (id: string) => ref(`${c}/${id}`) }),
    runTransaction: async (fn: any) => fn(tx),
  };
}
test("cart idempotency, approval, outbox and refund blocking are persisted without duplicate jobs", async () => {
  const db = memoryDB();
  db.records.set("products/kit", {
    name: "Kit",
    price: 12.5,
    active: true,
    allowQuantity: true,
    maxQuantity: 64,
    rewardDraft: { version: 1, items: [] },
  });
  let amount = 0,
    creates = 0,
    state = "pending";
  const gateway: any = {
    me: async () => ({ id: 42 }),
    create: async (body: any) => {
      creates++;
      amount = body.transaction_amount;
      return {
        ...payment,
        external_reference: body.external_reference,
        metadata: body.metadata,
        transaction_amount: amount,
        status: "pending",
        point_of_interaction: {
          transaction_data: { qr_code: "fixture", qr_code_base64: "aGVsbG8=" },
        },
      };
    },
    get: async () => ({
      ...payment,
      external_reference: id,
      metadata: { netcraft_order_id: id },
      transaction_amount: amount,
      status: state,
    }),
  };
  const key = "test-checkout-idempotency-12345",
    id = crypto.createHash("sha256").update(key).digest("hex"),
    api = pixService(db as any, gateway),
    input = {
      lines: [{ productId: "kit", productType: "product", quantity: 2 }],
      gamertag: "Tester",
      email: "tester@testuser.com",
      cpf: "12345678909",
    };
  await api.create(input, key);
  await api.create(input, key);
  assert.equal(creates, 1);
  assert.equal(amount, 25);
  assert.equal(
    [...db.records.keys()].filter((x) => x.startsWith("pixTestDeliveries/"))
      .length,
    0,
  );
  state = "approved";
  await api.reconcile(id);
  await api.reconcile(id);
  const jobs = [...db.records.entries()].filter(([k]) =>
    k.startsWith("pixTestDeliveries/"),
  );
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0][1].dispatchEnabled, false);
  assert.equal(
    jobs[0][1].approvedAt,
    payment.date_approved.replace("Z", ".000Z"),
  );
  await assert.rejects(() => api.create({ ...input, gamertag: "Other" }, key));
  state = "refunded";
  await api.reconcile(id);
  assert.equal(db.records.get(jobs[0][0]).state, "blocked");
});
