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
// HTTP cart quote must agree with the same authoritative catalog and
// coupon used by the transactional Pix creator. This is an isolated emulator.
const { default: express } = await import("express");
const { apiRouter } = await import("../server/routes/api.ts");
const { once: serverReady } = await import("node:events");
const quoteApp = express();
quoteApp.use(express.json());
quoteApp.use("/api",apiRouter);
const quoteServer=quoteApp.listen(0,"127.0.0.1");
await serverReady(quoteServer,"listening");
const quoteBase="http://127.0.0.1:"+(quoteServer.address() as any).port;
const getQuote=async (body:unknown)=>{
 const response=await fetch(quoteBase+"/api/cart/quote",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify(body),
 });
 return {status:response.status,body:await response.json()};
};
const quoteLines=[
 {productId:"pix-fixture",productType:"product",quantity:2},
 {productId:"pix-vip",productType:"vip",quantity:1},
];
try {
 const quoted=await getQuote({lines:quoteLines,couponCode:" localtest "});
 assert.equal(quoted.status,200);
 assert.equal(quoted.body.subtotalCents,4998);
 assert.equal(quoted.body.discountCents,500);
 assert.equal(quoted.body.totalCents,4498);
 assert.equal(quoted.body.couponCode,"LOCALTEST");
 assert.equal(quoted.body.combinedPaymentAvailable,true);
 assert.equal((await db.doc("pixTestCouponUsage/fixture").get()).exists,false,
   "read-only quote must never reserve coupon");
 const invalid=await getQuote({lines:[{...quoteLines[0],quantity:99}]});
 assert.equal(invalid.status,400);
 const fakeDiscount=await getQuote({lines:quoteLines,discountCents:4000});
 assert.equal(fakeDiscount.status,200);
 assert.equal(fakeDiscount.body.totalCents,4998,
   "client cannot forge the total/discount");
 const nonexisting=await getQuote({lines:quoteLines,couponCode:"UNKNOWN"});
 assert.equal(nonexisting.status,400);
} finally {
 quoteServer.closeAllConnections();
 await new Promise<void>(resolve=>quoteServer.close(()=>resolve()));
}

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
  const coreDraft = j.data().coreDraft;
  assert.equal(coreDraft.schema, 1);
  assert.equal(coreDraft.executable, false);
  assert.equal(coreDraft.dispatchEnabled, false);
  if (j.data().line.productType === "product") {
    assert.equal(coreDraft.payload.contract, "netcraft.delivery.v1");
    assert.deepEqual(coreDraft.payload.items, [{ itemId: "minecraft:diamond", quantity: 4 }]);
  } else {
    assert.equal(coreDraft.payload, null);
    assert.equal(coreDraft.reason, "vip_mapping_required");
  }
  // Paid mixed-cart lines now carry a server-compiled but non-executable plan.
  const plan = j.data().previewPlan;
  assert.equal(plan?.readyForDispatch, false);
  assert.equal(plan?.schema, 1);
  if (j.data().line.productType === "product") {
    assert.equal(plan?.kind, "items");
    assert.equal(plan?.blocker, "reward_review_required");
    assert.deepEqual(plan?.items, [{ itemId: "minecraft:diamond", quantity: 4 }]);
  } else {
    assert.equal(plan?.kind, "vip");
    assert.equal(plan?.blocker, "vip_mapping_required");
  }
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
const { testDeliverySummary } = await import("../server/payments/adminTestDeliveries.ts");
for (const j of jobs.docs) {
  const summary = testDeliverySummary(j.id, j.data(), (await db.doc("pixTestOrders/" + id).get()).data());
  assert.equal(summary.hold, "refunded");
  assert.equal(summary.dispatchEnabled, false);
  assert.equal("line" in summary, false);
}
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
const replayNonce = "e".repeat(32);
assert.equal(await deliveryStore.claimNonce(replayNonce, Date.now()), true);
assert.equal(await deliveryStore.claimNonce(replayNonce, Date.now()), false);
assert.equal(await deliveryStore.claimNonce("f".repeat(32), Date.now() - 180000), false);
const concurrentNonce = "d".repeat(32);
const nonceResults = await Promise.all([
  deliveryStore.claimNonce(concurrentNonce, Date.now()),
  deliveryStore.claimNonce(concurrentNonce, Date.now()),
]);
assert.equal(nonceResults.filter(Boolean).length, 1);
console.log("PASS atomic persistent nonce replay rejection, concurrency and stale timestamp");
console.log("PASS persistent demo delivery: duplicate seed, offline poll, retry, atomic ACK and refund block");

const express = (await import("express")).default;
const { createDeliverySimulationRouter } = await import("../server/routes/deliverySimulation.ts");
const signatureSecret = "emulator-simulation-secret-not-a-production-credential";
const app = express();
app.use(express.json());
const signedSimulationRouter = createDeliverySimulationRouter({ secret: signatureSecret, store: deliveryStore });
app.use("/sim", signedSimulationRouter);
app.use("/delivery", signedSimulationRouter);
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

// Simulated signed client acts as a stand-in for the future Bedrock bridge.
// Neither this test nor the client uses a Minecraft API or live Pix orders.
// @ts-ignore JavaScript test-only client intentionally has no generated declarations.
const { NetCraftDeliverySimulationClient } = await import("../minecraft/delivery-simulation/client.js");
const client = new NetCraftDeliverySimulationClient({ origin, secret: signatureSecret });
const clientId = "d".repeat(64) + "-1";
const clientJob = {
  deliveryId: clientId, gamertag: "OfflineBridge", kind: "vip",
  environment: "test", dispatchEnabled: false,
};
assert.equal((await client.seed(clientJob)).status, 201);
assert.equal((await client.seed(clientJob)).data.duplicate, true);
assert.deepEqual(await client.syncPlayer("OfflineBridge", false), { received: 0, simulated: 0 });
const firstSync = await client.syncPlayer("OfflineBridge", true);
assert.deepEqual(firstSync, { received: 1, simulated: 1 });
assert.deepEqual(await client.syncPlayer("OfflineBridge", true), { received: 0, simulated: 0 });
assert.equal((await client.refund(clientId)).data.state, "blocked");
assert.equal((await client.request("/ack", { deliveryId: clientId })).status, 409);
console.log("PASS signed localhost delivery client: offline, authenticated poll, ACK, idempotency, refund");
  console.log("PASS authenticated HTTP emulator delivery: HMAC, replay, offline poll, idempotency, concurrent ACK, retry and refund");
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
}


// Fase v0.3: the real private Pix TEST outbox created by pixService is
// independently reverified against a simulated Orders GET and leased locally.
// This is an emulator-only integration, never a commercial BDS dispatcher.
const { createIsolatedPixOutboxBridge } =
  await import("../server/delivery/isolatedPixOutboxBridge.ts");
const nextKey = crypto.randomUUID();
const nextId = crypto.createHash("sha256").update(nextKey).digest("hex");
const nextInput = {
  lines: [
    { productId: "pix-fixture", productType: "product", quantity: 1 },
    { productId: "pix-vip", productType: "vip", quantity: 1 },
  ],
  gamertag: "Local Tester",
  email: "local@testuser.com",
  cpf: "12345678909",
};
const nextOrder = await api.create(nextInput, nextKey);
assert.equal(nextOrder.state, "pending");
const mkBridge = () => createIsolatedPixOutboxBridge(db, gateway, {
  vipMappings: { "pix-vip": {
    rankTag: "ncbr:vip_explorer", duration: "30 dias", days: 30,
  } },
});
let bridge = mkBridge();
assert.equal((await bridge.offer(nextId + "-0", true)).status, "held");
provider = ordersFixture(nextId, "29.99", "approved");
await api.reconcile(nextId);
const pendingJobs = await db.collection("pixTestDeliveries")
  .where("orderId", "==", nextId).get();
assert.equal(pendingJobs.size, 2);
const itemId = nextId + "-0", vipId = nextId + "-1";
const firstOffer = await bridge.offer(itemId, false);
assert.equal(firstOffer.status, "held");
const concurrentOffers = await Promise.all([
  bridge.offer(itemId, true), bridge.offer(itemId, true),
]);
assert.equal(concurrentOffers.filter(o => o.status === "offered").length, 1);
assert.deepEqual(
  (concurrentOffers.find(o => o.status === "offered") as any).payload.items,
  [{ itemId: "minecraft:diamond", quantity: 2 }],
);
assert.equal((await bridge.acknowledge(itemId, "inventory_full")).status, "held");
assert.equal((await bridge.acknowledge(itemId, "applied")).status, "acknowledged");
const vipOffer = await bridge.offer(vipId, true);
assert.equal(vipOffer.status, "offered");
assert.equal((vipOffer as any).payload.days, 30);
assert.equal((await bridge.acknowledge(vipId, "applied")).status, "acknowledged");
bridge = mkBridge();
assert.equal((await bridge.offer(itemId, true)).status, "held");
assert.equal((await bridge.offer(vipId, true)).status, "held");
assert.equal((await bridge.inspect(itemId)).status, "acknowledged");
provider = ordersFixture(nextId, "29.99", "refunded");
await api.reconcile(nextId);
assert.equal((await bridge.offer(itemId, true)).status, "held");
assert.equal((await bridge.block(itemId)).status, "refunded_after_ack");
assert.equal((await bridge.block(vipId)).status, "refunded_after_ack");
console.log("PASS isolated emulator Pix order → authenticated approval GET → durable kit/VIP leases → ACK/restart → refund review, no real dispatch");



// Full local-only integration: real Firestore emulator -> mock provider approval
// -> authenticated TLS -> verified bridge lease -> simulated BDS receipt.
// This intentionally does NOT launch BDS, call the live provider, or grant items.
const fsTLS = await import("node:fs");
const osTLS = await import("node:os");
const pathTLS = await import("node:path");
const httpsTLS = await import("node:https");
const { execFileSync: execTLS } = await import("node:child_process");
const { createRequire: createRequireTLS } = await import("node:module");
const requireTLS = createRequireTLS(import.meta.url);
const {createVerifiedOutboxServer} =
  requireTLS("../minecraft/delivery-e2e-local/verified_outbox_server.cjs");
const labKey = crypto.randomUUID();
const labId = crypto.createHash("sha256").update(labKey).digest("hex");
const labOrder = await api.create(nextInput,labKey);
assert.equal(labOrder.id,labId);
assert.equal(labOrder.state,"pending");
provider=ordersFixture(labId,"29.99","approved");
await api.reconcile(labId);
const labBridge=mkBridge();
const labItem=labId+"-0",labVip=labId+"-1";
const labToken="c".repeat(64);
const labDir=fsTLS.mkdtempSync(pathTLS.join(osTLS.tmpdir(),"ncbr-pix-tls-"));
let tlsServer: any;
try {
  execTLS("openssl",["req","-x509","-newkey","rsa:2048","-nodes",
    "-keyout",pathTLS.join(labDir,"key.pem"),
    "-out",pathTLS.join(labDir,"cert.pem"),
    "-days","1","-subj","/CN=localhost",
    "-addext","subjectAltName=IP:127.0.0.1,DNS:localhost"],{stdio:"ignore"});
  const tlsKey=fsTLS.readFileSync(pathTLS.join(labDir,"key.pem"));
  const tlsCert=fsTLS.readFileSync(pathTLS.join(labDir,"cert.pem"));
  const tlsConfig={key:tlsKey,cert:tlsCert,token:labToken,
    gamertag:"Local Tester",ids:[labItem,labVip],bridge:labBridge};
  async function startServer() {
    tlsServer=createVerifiedOutboxServer(tlsConfig);
    await new Promise<void>((resolve,reject)=>{
      tlsServer.once("error",reject);
      tlsServer.listen(0,"127.0.0.1",resolve);
    });
  }
  async function restartServer() {
    await new Promise<void>(resolve=>tlsServer.close(()=>resolve()));
    await startServer();
  }
  async function tlsPost(route:string,body:object,nonce?:string,secret=labToken) {
    return await new Promise<{status:number;body:any}>((resolve,reject)=>{
      const payload=JSON.stringify(body);
      const req=httpsTLS.request({
        hostname:"127.0.0.1",port:tlsServer.address().port,
        path:route,method:"POST",ca:tlsCert,minVersion:"TLSv1.2",
        headers:{"Content-Type":"application/json",
          "x-nc-bds-token":secret,
          ...(nonce?{"x-nc-nonce":nonce,"x-nc-timestamp":String(Date.now())}:{}),
          "Content-Length":String(Buffer.byteLength(payload))},
      },res=>{
        let raw="";
        res.on("data",chunk=>{raw+=chunk.toString();});
        res.on("end",()=>{
          try{resolve({status:res.statusCode||0,body:JSON.parse(raw)});}
          catch(err){reject(err);}
        });
      });
      req.on("error",reject);req.end(payload);
    });
  }
  async function tlsChallenge(){
    const response=await tlsPost("/delivery/challenge",{});
    assert.equal(response.status,200);
    assert.match(response.body.nonce,/^[a-f0-9]{32}$/);
    return response.body.nonce as string;
  }
  await startServer();
  assert.equal((await tlsPost("/delivery/challenge",{},"","0".repeat(64))).status,401);
  assert.equal((await tlsPost("/delivery/ack",
    {deliveryId:labItem,result:"applied"},await tlsChallenge())).status,409);
  const firstPoll=await tlsPost("/delivery/poll",
    {gamertag:"Local Tester"},await tlsChallenge());
  assert.equal(firstPoll.status,200);
  assert.equal(firstPoll.body.dispatchEnabled,false);
  assert.equal(firstPoll.body.environment,"verified_pix_emulator");
  assert.deepEqual(firstPoll.body.deliveries.map((d:any)=>d.kind),["items","vip"]);
  assert.deepEqual(firstPoll.body.deliveries[0].items,
    [{itemId:"minecraft:diamond",quantity:2}]);
  assert.equal(firstPoll.body.deliveries[1].rankTag,"ncbr:vip_explorer");
  assert.equal(firstPoll.body.deliveries[1].days,30);

  // An actual Core would only report inventory_full before writing a receipt.
  // The simulated executor sends that safe pre-receipt result here.
  await restartServer();
  const nack=await tlsPost("/delivery/nack",
    {deliveryId:labItem,reason:"inventory_full",receipt:"none"},
    await tlsChallenge());
  assert.equal(nack.status,200);
  assert.equal(nack.body.retryable,true);
  const secondPoll=await tlsPost("/delivery/poll",
    {gamertag:"Local Tester"},await tlsChallenge());
  assert.equal(secondPoll.status,200);
  assert.deepEqual(secondPoll.body.deliveries.map((d:any)=>d.id),[labItem]);

  const staleNonce=await tlsChallenge();
  await restartServer();
  assert.equal((await tlsPost("/delivery/ack",
    {deliveryId:labItem,result:"applied"},staleNonce)).status,401);
  const kitAck=await tlsPost("/delivery/ack",
    {deliveryId:labItem,result:"applied"},await tlsChallenge());
  assert.equal(kitAck.status,200);
  assert.equal((await labBridge.inspect(labItem)).status,"acknowledged");
  // Provider-side refund BEFORE local reconciliation cannot become a clean ACK.
  provider=ordersFixture(labId,"29.99","refunded");
  const vipAck=await tlsPost("/delivery/ack",
    {deliveryId:labVip,result:"applied"},await tlsChallenge());
  assert.equal(vipAck.status,409);
  assert.equal((await labBridge.inspect(labVip)).status,"refund_after_grant_review");
  const postRefund=await tlsPost("/delivery/poll",
    {gamertag:"Local Tester"},await tlsChallenge());
  assert.equal(postRefund.status,200);
  assert.deepEqual(postRefund.body.deliveries,[]);
  await api.reconcile(labId);
  assert.equal((await labBridge.block(labItem)).status,"refunded_after_ack");
  console.log("PASS real local Firestore + mocked approved Pix GET + TLS BDS protocol + safe inventory retry + restart ACK + refund review; no live grant");
} finally {
  if(tlsServer?.listening)await new Promise<void>(resolve=>tlsServer.close(()=>resolve()));
  fsTLS.rmSync(labDir,{recursive:true,force:true});
}

await db.terminate();
