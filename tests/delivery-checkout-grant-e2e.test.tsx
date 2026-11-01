import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pixService } from "../server/payments/service.ts";
import { createIsolatedPixOutboxBridge } from "../server/delivery/isolatedPixOutboxBridge.ts";
import { memoryDB, ordersFixture } from "./fixtures/pixOrders.ts";
// @ts-ignore: shared BDS executor is vanilla JavaScript.
import { createVerifiedCoreLabEngine } from "../minecraft/delivery-v031-core-lab/core_delivery_lab_v031.js";
// @ts-ignore: shared BDS-only response contract is vanilla JavaScript.
import { validateVerifiedOutboxResponse } from "../minecraft/delivery-e2e-local/verified_outbox_protocol.js";

const require = createRequire(import.meta.url);
const { createVerifiedOutboxServer } = require("../minecraft/delivery-e2e-local/verified_outbox_server.cjs");

test("full OFF lab: mixed-cart Pix -> verified HTTPS -> Core kit/VIP -> ACK -> restart/replay/refund", async () => {
  // Fail closed: this test cannot use the user's project, real provider or production.
  for (const key of ["VERCEL_ENV", "MERCADOPAGO_ACCESS_TOKEN",
    "FIREBASE_SERVICE_ACCOUNT_JSON", "GOOGLE_APPLICATION_CREDENTIALS"]) {
    assert.ok(!process.env[key], key + " must not exist for this fixture");
  }
  process.env.NODE_ENV = "test";
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8085";

  const db = memoryDB();
  db.records.set("products/lab-kit", {
    id: "lab-kit", name: "Kit de laboratório", price: 15,
    active: true, allowQuantity: false,
    rewardDraft: { version: 1, items: [
      { itemId: "minecraft:diamond", quantity: 3 },
      { itemId: "minecraft:iron_ingot", quantity: 6 },
    ] },
  });
  db.records.set("vips/lab-explorer", {
    id: "lab-explorer", name: "Explorer LAB", price: 10,
    active: true, duration: "30 dias",
  });
  let resource: any;
  let providerPosts = 0;
  const gateway: any = {
    me: async () => ({ id: 42, netcraftTestAccount: true }),
    create: async (body: any) => {
      providerPosts++;
      resource = ordersFixture(body.external_reference, body.total_amount);
      return structuredClone(resource);
    },
    get: async () => structuredClone(resource),
  };
  const service = pixService(db as any, gateway);
  const playerName = "Lab Tester";
  const input = {
    lines: [
      { productId: "lab-kit", productType: "product", quantity: 1 },
      { productId: "lab-explorer", productType: "vip", quantity: 1 },
    ],
    gamertag: playerName, email: "lab@example.com", cpf: "12345678909",
  };
  const checkoutKey = "end-to-end-verified-delivery-lab-12345";
  const created = await service.create(input, checkoutKey);
  assert.equal(created.state, "pending");
  assert.equal(created.totalCents, 2500);
  assert.equal(providerPosts, 1);
  assert.equal([...db.records.keys()].filter(k => k.startsWith("pixTestDeliveries/")).length, 0);

  // Only an authenticated provider GET fixture may put a job into the queue.
  resource = ordersFixture(created.id, "25.00", "approved");
  await service.reconcile(created.id);
  const ids = [created.id + "-0", created.id + "-1"];
  assert.equal(ids.filter(id => db.records.has("pixTestDeliveries/" + id)).length, 2);
  const bridge = createIsolatedPixOutboxBridge(db as any, gateway, {
    vipMappings: { "lab-explorer": {
      rankTag: "ncbr:vip_explorer", days: 30, duration: "30 dias",
    } },
  });

  const receipts = new Map<string, string>();
  const inventory: any[] = [];
  let freeSlots = 0;
  let vipGrants = 0;
  const player = {
    isValid: true, name: playerName,
    getComponent: () => ({ container: {
      isValid: true,
      get emptySlotsCount() { return freeSlots - inventory.length; },
      addItem: (stack: any) => { inventory.push(stack); return undefined; },
    } }),
  };
  const world = {
    getAllPlayers: () => [player],
    getDynamicProperty: (id: string) => receipts.get(id),
    setDynamicProperty: (id: string, value: string) => { receipts.set(id, value); },
  };
  class ItemStack {
    maxAmount = 64;
    constructor(public typeId: string, public amount: number) {
      if (!["minecraft:diamond", "minecraft:iron_ingot"].includes(typeId))
        throw Error("unknown_item");
    }
  }
  const Server = {
    VIPSystem: {
      vipRanks: { get: (tag: string) => tag === "ncbr:vip_explorer" ? {} : null },
      getVIP: () => null,
      grantDeliveryVIPLab: () => { vipGrants++; return "applied"; },
    },
  };
  const engine = () => createVerifiedCoreLabEngine({ world, ItemStack, Server });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ncbr-full-delivery-"));
  const token = "a".repeat(64);
  let server: any;
  try {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", path.join(tmp, "key.pem"), "-out", path.join(tmp, "cert.pem"),
      "-days", "1", "-subj", "/CN=localhost",
      "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost"], { stdio: "ignore" });
    const key = fs.readFileSync(path.join(tmp, "key.pem"));
    const cert = fs.readFileSync(path.join(tmp, "cert.pem"));
    const opts = { key, cert, token, gamertag: playerName, ids, bridge };
    const start = async () => {
      server = createVerifiedOutboxServer(opts);
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
    };
    const stop = async () =>
      new Promise<void>(resolve => server.close(() => resolve()));
    const post = (endpoint: string, body: object, nonce?: string, suppliedToken = token) =>
      new Promise<{status: number; data: any}>((resolve, reject) => {
        const raw = JSON.stringify(body);
        const req = https.request({
          hostname: "127.0.0.1", port: server.address().port,
          path: endpoint, method: "POST", ca: cert, minVersion: "TLSv1.2",
          headers: {
            "content-type": "application/json", "x-nc-bds-token": suppliedToken,
            "content-length": String(Buffer.byteLength(raw)),
            ...(nonce ? { "x-nc-nonce": nonce, "x-nc-timestamp": String(Date.now()) } : {}),
          },
        }, response => {
          let responseText = "";
          response.on("data", chunk => { responseText += chunk.toString(); });
          response.on("end", () => {
            try { resolve({ status: response.statusCode || 0, data: JSON.parse(responseText) }); }
            catch (error) { reject(error); }
          });
        });
        req.on("error", reject);
        req.end(raw);
      });
    await start();
    try {
      assert.equal((await post("/delivery/challenge", {}, undefined, "b".repeat(64))).status, 401);
      const nonce = async () => {
        const challenge = await post("/delivery/challenge", {});
        assert.equal(challenge.status, 200);
        return challenge.data.nonce as string;
      };
      const poll = async () => {
        const response = await post("/delivery/poll", { gamertag: playerName }, await nonce());
        assert.equal(response.status, 200);
        const jobs = validateVerifiedOutboxResponse(response.data, playerName);
        assert.ok(jobs, "Bedrock must reject untrusted outbox responses");
        return jobs;
      };
      const jobs = await poll();
      assert.equal(jobs.length, 2);
      assert.equal(jobs[0].kind, "items");
      assert.equal(jobs[1].kind, "vip");

      // Inventory-full is a safe pre-receipt NACK. Neither kits nor receipt may be lost.
      assert.equal(engine().execute(jobs[0]).status, "inventory_full");
      assert.equal(engine().receiptStatus(ids[0]), "none");
      assert.equal((await post("/delivery/nack",
        { deliveryId: ids[0], reason: "inventory_full", receipt: "none" },
        await nonce())).status, 200);
      assert.equal(inventory.length, 0);

      assert.equal(engine().execute(jobs[1]).status, "applied");
      assert.equal((await post("/delivery/ack",
        { deliveryId: ids[1], result: "applied" }, await nonce())).status, 200);
      assert.equal(vipGrants, 1);

      freeSlots = 3;
      const retry = await poll();
      assert.deepEqual(retry.map((j: any) => j.id), [ids[0]]);
      assert.equal(engine().execute(retry[0]).status, "applied");
      assert.equal((await post("/delivery/ack",
        { deliveryId: ids[0], result: "applied" }, await nonce())).status, 200);
      assert.deepEqual(inventory.map(i => [i.typeId, i.amount]), [
        ["minecraft:diamond", 3], ["minecraft:iron_ingot", 6],
      ]);
      assert.equal(vipGrants, 1);

      // After both the HTTPS server and Core engine restart, receipts
      // and transactional outbox ACKs prevent duplicate gifts and VIP renewal.
      await stop(); await start();
      assert.deepEqual(await poll(), []);
      assert.equal(engine().execute(jobs[0]).status, "already_applied");
      assert.equal(engine().execute(jobs[1]).status, "already_applied");
      assert.equal(inventory.length, 2);
      assert.equal(vipGrants, 1);
      assert.equal(providerPosts, 1);

      // Refunding an approved test order must quarantine already ACKed grants.
      resource = ordersFixture(created.id, "25.00", "refunded");
      await service.reconcile(created.id);
      assert.deepEqual(await poll(), []);
      assert.equal((await bridge.block(ids[0])).status, "refunded_after_ack");
      assert.equal((await bridge.block(ids[1])).status, "refunded_after_ack");
      assert.equal(vipGrants, 1);
    } finally {
      if (server?.listening) await stop();
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
