import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import { once } from "node:events";
import {
  testToken,
  normalizeCpf,
  MercadoPago,
  webhookSignature,
  verifyPayment,
} from "../server/payments/mercadoPago.ts";
import {
  amountCents,
  orderRequest,
  orderItems,
  verifyOrder,
  ordersState,
  providerKey,
} from "../server/payments/ordersContract.ts";
import { pixService, discounted } from "../server/payments/service.ts";
import { createPixRouter } from "../server/routes/pix.ts";
import { ordersFixture, memoryDB, ORD, PAY } from "./fixtures/pixOrders.ts";
const expected = {
  id: "local-order",
  providerOrderId: ORD,
  paymentId: PAY,
  totalCents: 2500,
  currency: "BRL",
  collector: "42",
  receiverIsTestAccount: true,
};
const input = {
  lines: [{ productId: "kit", productType: "product", quantity: 2 }],
  gamertag: "Local Tester",
  email: "local@testuser.com",
  cpf: "123.456.789-09",
};
function setup() {
  const db = memoryDB();
  db.records.set("products/kit", {
    name: "Local only kit",
    price: 12.5,
    active: true,
  });
  let resource: any,
    creates = 0,
    gets = 0;
  const gateway: any = {
    me: async () => ({ id: 42, netcraftTestAccount: true }),
    create: async (body: any, key: string) => {
      creates++;
      assert.match(
        key,
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/,
      );
      resource = ordersFixture(body.external_reference, body.total_amount);
      return structuredClone(resource);
    },
    get: async (id: string) => {
      gets++;
      assert.equal(id, ORD);
      return structuredClone(resource);
    },
  };
  return {
    db,
    gateway,
    api: pixService(db as any, gateway),
    resource: () => resource,
    setResource: (r: any) => {
      resource = r;
    },
    creates: () => creates,
    gets: () => gets,
  };
}
test("credentials reject production and real APP_USR accounts before a POST", async () => {
  assert.throws(() =>
    testToken({
      VERCEL_ENV: "production",
      MERCADOPAGO_ACCESS_TOKEN: "TEST-fixture",
    }),
  );
  assert.throws(() => testToken({}));
  assert.equal(
    testToken({ MERCADOPAGO_ACCESS_TOKEN: " APP_USR-fixture " }),
    "APP_USR-fixture",
  );
  for (const testUser of [false, true]) {
    const calls: string[] = [];
    const g = new MercadoPago("APP_USR-fixture", async (_url, options) => {
      calls.push(String(options?.method));
      return new Response(
        JSON.stringify(
          options?.method === "POST"
            ? { id: ORD }
            : { id: 42, tags: testUser ? ["test_user"] : ["normal"] },
        ),
      );
    });
    if (testUser) await g.create({}, "same-key");
    else await assert.rejects(() => g.create({}, "same-key"), /conta real/);
    assert.equal(calls.includes("POST"), testUser);
  }
});
test("transport creates and queries ORD IDs; legacy is read-only; errors never expose token or provider text", async () => {
  const calls: any[] = [];
  const g = new MercadoPago("TEST-fixture", async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ id: 42 }));
  });
  await g.create({ type: "online" }, "fixture-key");
  await g.get(ORD);
  await g.getLegacyPayment("123");
  assert.equal(calls[1].url, "https://api.mercadopago.com/v1/orders");
  assert.equal(calls[1].options.headers["X-Idempotency-Key"], "fixture-key");
  assert.equal(calls[2].url, `https://api.mercadopago.com/v1/orders/${ORD}`);
  assert.equal(calls[3].options.method, "GET");
  assert.throws(() => g.get("123"));
  assert.throws(() => g.get("../x"));
  const bad = new MercadoPago(
    "TEST-fixture",
    async () =>
      new Response(
        JSON.stringify({
          error: "invalid_credentials",
          message: "PRIVATE_TOKEN",
          cause: [{ code: 7 }],
        }),
        { status: 401 },
      ),
  );
  await assert.rejects(
    () => bad.me(),
    (e) =>
      e instanceof Error &&
      e.message.includes("HTTP 401") &&
      !e.message.includes("PRIVATE_TOKEN") &&
      !e.message.includes("TEST-fixture"),
  );
});
test("contract uses string amounts, Pix bank_transfer and server item prices; no legacy fields", () => {
  const req = orderRequest(
    {
      ...expected,
      subtotalCents: 2500,
      lines: [
        {
          productType: "product",
          productId: "kit",
          quantity: 2,
          name: "Kit",
          unitCents: 1250,
          lineCents: 2500,
        },
      ],
    },
    { email: "local@testuser.com" },
  );
  assert.equal(req.total_amount, "25.00");
  assert.equal("processing_mode" in req, false);
  assert.equal("items" in req, false);
  assert.deepEqual(req.payer, { email: "local@testuser.com" });
  assert.deepEqual(req.transactions.payments, [
    {
      amount: "25.00",
      payment_method: { id: "pix", type: "bank_transfer" },
    },
  ]);
  for (const field of [
    "metadata",
    "notification_url",
    "transaction_amount",
    "payment_method_id",
    "date_of_expiration",
  ])
    assert.equal(field in req, false);
  assert.equal(amountCents("0.99"), 99);
  assert.equal(amountCents(0.99), 99);
  for (const v of ["1.001", "1e3", "NaN", -1])
    assert.throws(() => amountCents(v));
  assert.equal(providerKey("id"), providerKey("id"));
  assert.equal(normalizeCpf("123.456.789-09"), "12345678909");
});
test("discount allocation preserves exact net cents across mixed quantities and never changes internal lines", () => {
  const o = {
    totalCents: 1001,
    subtotalCents: 3000,
    lines: [
      {
        productId: "a",
        productType: "product",
        name: "A",
        quantity: 3,
        lineCents: 2100,
      },
      {
        productId: "b",
        productType: "vip",
        name: "B",
        quantity: 1,
        lineCents: 900,
      },
    ],
  };
  const before = JSON.stringify(o);
  const items = orderItems(o);
  assert.equal(
    items.reduce((n, i) => n + Math.round(i.unit_price * 100) * i.quantity, 0),
    1001,
  );
  assert.equal(JSON.stringify(o), before);
  assert.equal(
    items.reduce((n, i) => n + i.quantity, 0),
    4,
  );
});
test("order verification requires matching receiver, external reference, currency, amounts and PAY ID", () => {
  const resource = ordersFixture(expected.id);
  assert.equal(verifyOrder(resource, expected, "42").id, PAY);
  for (const patch of [
    { id: "ORD01JP84C939T20S0P1DN382FQ6L" },
    { external_reference: "different" },
    { user_id: 43 },
    { country_code: "ARG" },
    { currency_id: "USD" },
    { total_amount: "24.99" },
    { type: "qr" },
    {
      transactions: {
        payments: [
          resource.transactions.payments[0],
          resource.transactions.payments[0],
        ],
      },
    },
  ])
    assert.throws(() => verifyOrder({ ...resource, ...patch }, expected, "42"));
  for (const patch of [
    { id: "PAY01JP84C939T20S0P1DN6FCMWQD" },
    { amount: "0.01" },
    { payment_method: { id: "visa", type: "credit_card" } },
  ])
    assert.throws(() =>
      verifyOrder(
        {
          ...resource,
          transactions: {
            payments: [{ ...resource.transactions.payments[0], ...patch }],
          },
        },
        expected,
        "42",
      ),
    );
});
test("status requires both processed/accredited and fully paid values; refunds and expiration block approval", () => {
  const approved = ordersFixture(expected.id, "25.00", "approved"),
    p = approved.transactions.payments[0];
  assert.equal(ordersState(approved, p, "2099-01-01"), "approved");
  assert.throws(() =>
    ordersState({ ...approved, total_paid_amount: "0.00" }, p, "2099-01-01"),
  );
  assert.throws(() =>
    ordersState(approved, { ...p, status: "processing" }, "2099-01-01"),
  );
  assert.equal(
    ordersState(
      { ...approved, status_detail: "partially_refunded" },
      p,
      "2099-01-01",
    ),
    "refunded",
  );
  assert.equal(
    ordersState({ ...approved, status: "charged_back" }, p, "2099-01-01"),
    "refunded",
  );
  assert.equal(
    ordersState(
      { status: "canceled", status_detail: "expired" },
      null,
      "2099-01-01",
    ),
    "expired",
  );
  assert.equal(
    ordersState({ status: "failed" }, null, "2099-01-01"),
    "cancelled",
  );
});
test("create retries reuse a single provider order; empty QR image is generated from authenticated API code", async () => {
  const s = setup(),
    key = "local-idempotency-checkout-1234";
  const first = await s.api.create(input, key);
  await s.api.create(input, key);
  assert.equal(s.creates(), 1);
  assert.equal(s.gets(), 2);
  assert.equal(first.state, "pending");
  assert.equal(first.providerOrderId, ORD);
  assert.ok(first.qrBase64);
  assert.equal(
    Buffer.from(first.qrBase64, "base64").subarray(1, 4).toString(),
    "PNG",
  );
  assert.equal(
    [...s.db.records.keys()].filter((k) => k.startsWith("pixTestDeliveries/"))
      .length,
    0,
  );
  await assert.rejects(() =>
    s.api.create({ ...input, gamertag: "Other" }, key),
  );
});
test("approval comes only from GET, duplicate notifications never duplicate jobs, approval date is not invented", async () => {
  const s = setup(),
    key = "local-approval-checkout-1234";
  const first = await s.api.create(input, key);
  s.setResource(ordersFixture(first.id, "25.00", "approved"));
  await s.api.reconcile(first.id);
  await s.api.reconcile(first.id);
  const approved = await s.api.view(first.id);
  assert.equal(approved.state, "approved");
  assert.equal(approved.approvedAt, null);
  assert.equal(approved.requiresApprovalTimestamp, true);
  assert.ok(approved.approvalObservedAt);
  const jobs = [...s.db.records.entries()].filter(([k]) =>
    k.startsWith("pixTestDeliveries/"),
  );
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0][1].dispatchEnabled, false);
  s.setResource(ordersFixture(first.id, "25.00", "refunded"));
  await s.api.reconcile(first.id);
  assert.equal(s.db.records.get(jobs[0][0]).state, "blocked");
});
test("asynchronous creation binds ORD without payments and polls until QR arrives without a second POST", async () => {
  const s = setup();
  s.gateway.create = async (body: any) => {
    const r = ordersFixture(
      body.external_reference,
      body.total_amount,
      "processing",
    );
    r.transactions = { payments: [] };
    s.setResource(r);
    return structuredClone(r);
  };
  const first = await s.api.create(input, "async-order-checkout-12345");
  assert.equal(first.state, "processing");
  assert.equal(first.paymentId, null);
  s.setResource(ordersFixture(first.id));
  await s.api.reconcile(first.id);
  assert.equal((await s.api.view(first.id)).paymentId, PAY);
});
test("legacy records and their monetary history are never overwritten by a new Orders creation", async () => {
  const s = setup(),
    key = "legacy-local-checkout-12345",
    id = crypto.createHash("sha256").update(key).digest("hex");
  const saved = { id, paymentId: "123", state: "pending", amount: 25 };
  s.db.records.set("pixTestOrders/" + id, saved);
  await assert.rejects(() => s.api.create(input, key), /preservado/);
  assert.deepEqual(s.db.records.get("pixTestOrders/" + id), saved);
  assert.equal(s.creates(), 0);
});
test("legacy payment verification remains available for historical reconciliation only", () => {
  const p = {
    id: 123,
    external_reference: "old",
    collector_id: 42,
    currency_id: "BRL",
    payment_method_id: "pix",
    live_mode: false,
    transaction_amount: 25,
    metadata: { netcraft_order_id: "old" },
    status: "pending",
  };
  verifyPayment(p, { id: "old", paymentId: "123", totalCents: 2500 }, "42");
  assert.throws(() =>
    verifyPayment(
      { ...p, transaction_amount: 0.01 },
      { id: "old", paymentId: "123", totalCents: 2500 },
      "42",
    ),
  );
});
test("coupon validity, minimum and usage are server checked", () => {
  const c = { active: true, discountType: "percentage", discountValue: 10 };
  assert.equal(discounted(2599, c), 260);
  for (const patch of [
    { active: false },
    { maxUses: 1, usedCount: 1 },
    { expiresAt: "2000-01-01" },
    { minOrderValue: 30 },
  ])
    assert.throws(() => discounted(2599, { ...c, ...patch }));
});
test("Orders HMAC validates alphanumeric data.id and rejects tampering or stale signatures", () => {
  const ts = String(Date.now()),
    sig = crypto
      .createHmac("sha256", "fixture")
      .update(`id:${ORD.toLowerCase()};request-id:req;ts:${ts};`)
      .digest("hex");
  assert.equal(
    webhookSignature(ORD, "req", `ts=${ts},v1=${sig}`, "fixture"),
    true,
  );
  assert.equal(
    webhookSignature(ORD, "req", `ts=${ts},v1=${sig}`, "other"),
    false,
  );
  assert.equal(
    webhookSignature(
      ORD,
      "req",
      `ts=${ts},v1=${sig}`,
      "fixture",
      Date.now() + 600000,
    ),
    false,
  );
});
test("HTTP webhook verifies signature and re-queries Orders API instead of trusting body approval", async () => {
  const s = setup(),
    first = await s.api.create(input, "http-webhook-checkout-12345");
  const app = express();
  app.use(express.json());
  app.use(
    createPixRouter({
      database: () => s.db as any,
      gateway: () => s.gateway,
      assertEnvironment: () => {},
      webhookSecret: () => "fixture",
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as any).port;
  try {
    const url = `http://127.0.0.1:${port}/pix/webhook?data.id=${ORD}&type=order`,
      ts = String(Date.now()),
      sig = crypto
        .createHmac("sha256", "fixture")
        .update(`id:${ORD.toLowerCase()};request-id:req;ts:${ts};`)
        .digest("hex"),
      headers = {
        "content-type": "application/json",
        "x-request-id": "req",
        "x-signature": `ts=${ts},v1=${sig}`,
      };
    assert.equal(
      (
        await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).status,
      401,
    );
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "order",
        data: { id: ORD, status: "processed" },
      }),
    });
    assert.equal(response.status, 204);
    assert.equal((await s.api.view(first.id)).state, "pending");
    s.setResource(ordersFixture(first.id, "25.00", "approved"));
    assert.equal(
      (await fetch(url, { method: "POST", headers, body: "{}" })).status,
      204,
    );
    assert.equal((await s.api.view(first.id)).state, "approved");
    assert.equal(
      (
        await fetch(`http://127.0.0.1:${port}/pix/orders/${first.id}`, {
          headers: { "x-checkout-key": "wrong" },
        })
      ).status,
      401,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("a processed POST cannot approve the local order when the authenticated GET remains pending",async()=>{
 const s=setup();
 s.gateway.create=async(body:any)=>{s.setResource(ordersFixture(body.external_reference,body.total_amount));return ordersFixture(body.external_reference,body.total_amount,"approved");};
 const result=await s.api.create(input,"post-not-approval-12345678");assert.equal(result.state,"pending");assert.equal([...s.db.records.keys()].filter(k=>k.startsWith("pixTestDeliveries/")).length,0);
});
