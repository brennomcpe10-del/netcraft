import { test } from "node:test";
import assert from "node:assert/strict";
import { MercadoPago, PixError } from "../server/payments/mercadoPago.ts";
import { pixService } from "../server/payments/service.ts";
import { memoryDB, ordersFixture } from "./fixtures/pixOrders.ts";

test("provider POST itself refuses a receiver without test_user, even for direct callers", async () => {
  const methods: string[] = [];
  const gateway = new MercadoPago("TEST-local-fixture", async (_url, options) => {
    methods.push(String(options?.method));
    return new Response(JSON.stringify({ id: 42, tags: ["regular_account"] }));
  });
  await assert.rejects(
    gateway.create({ type: "online" }, "no-production-charge"),
    (error: any) => error instanceof PixError && error.status === 503,
  );
  assert.deepEqual(methods, ["GET"]);
});

test("reconciliation cannot approve a saved test order after receiver identity changes", async () => {
  const db = memoryDB();
  db.records.set("products/lab-kit", {
    name: "Laboratory item", price: 12.5, active: true,
  });
  let isTest = true;
  let collector = 42;
  let resource: any;
  let reads = 0;
  const gateway: any = {
    me: async () => ({ id: collector, netcraftTestAccount: isTest }),
    create: async (request: any) => {
      resource = ordersFixture(request.external_reference, request.total_amount);
      return structuredClone(resource);
    },
    get: async () => { reads++; return structuredClone(resource); },
  };
  const service = pixService(db as any, gateway);
  const order = await service.create({
    lines: [{ productId: "lab-kit", productType: "product", quantity: 1 }],
    gamertag: "Lab Tester", email: "test@example.com", cpf: "12345678909",
  }, "sandbox-receiver-identity-lock-1234");
  assert.equal(order.state, "pending");
  resource = ordersFixture(order.id, "12.50", "approved");
  const previous = structuredClone(db.records.get("pixTestOrders/" + order.id));
  const initialReads = reads;

  isTest = false;
  await assert.rejects(service.reconcile(order.id), /Conta recebedora de teste/);
  assert.equal(reads, initialReads, "do not query or trust provider using a real receiver");
  assert.deepEqual(db.records.get("pixTestOrders/" + order.id), previous);
  assert.equal([...db.records.keys()].some(k => k.startsWith("pixTestDeliveries/")), false);

  isTest = true;
  collector = 43;
  await assert.rejects(service.reconcile(order.id), /Conta recebedora de teste/);
  assert.deepEqual(db.records.get("pixTestOrders/" + order.id), previous);
  assert.equal([...db.records.keys()].some(k => k.startsWith("pixTestDeliveries/")), false);

  collector = 42;
  await service.reconcile(order.id);
  assert.equal((await service.view(order.id)).state, "approved");
  const jobs = [...db.records.values()].filter(v => v?.orderId === order.id && v?.dispatchEnabled === false);
  assert.equal(jobs.length, 1);
});
