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
// Commercial Delivery candidate exercise against REAL local Firestore
// transactions, not a fake in-memory transaction implementation.
// This is intentionally disconnected from all production routes and BDS.
{
 const {createCommercialStagingService}=
   await import("../server/delivery/commercialStagingService.ts");
 const candidateId="e".repeat(64);
 const provider=ordersFixture(candidateId,"25.00","approved");
 provider.live_mode=true;
 const candidateRef=db.doc("pixCommercialOrders/"+candidateId);
 await candidateRef.set({
  id:candidateId,environment:"commercial",catalogValidated:true,
  providerOrderId:provider.id,collector:"42",currency:"BRL",
  totalCents:2500,gamertag:"Emulator Tester",state:"pending",
  lines:[{productType:"product",productId:"kit",quantity:1,
   reward:{version:1,items:[{itemId:"minecraft:diamond",quantity:2}]}}],
 });
 const candidate=createCommercialStagingService(db,{
  me:async()=>({id:42,netcraftTestAccount:false}),
  get:async()=>structuredClone(provider),
 },{keyring:{"bds_emulator":"not-real-hmac-secret-1234567890123456789"}});
 const queued=await Promise.all([
  candidate.reconcileAndQueue(candidateId),
  candidate.reconcileAndQueue(candidateId),
 ]);
 assert.equal(queued.reduce((count,row)=>count+row.created,0),1,
  "provider approval must generate exactly one durable candidate");
 const candidateJobId=candidateId+"-0";
 const offers=await Promise.all([
  candidate.offer(candidateJobId,"Emulator Tester",true),
  candidate.offer(candidateJobId,"Emulator Tester",true),
 ]);
 const acquired=offers.filter(x=>x.status==="offered");
 assert.equal(acquired.length,1,
  "Firestore transaction prevents double grants across worker concurrency");
 const token=(acquired[0] as any).leaseToken;
 assert.equal((await candidate.acknowledge(candidateJobId,token,"applied")).status,
  "acknowledged");
 assert.equal((await candidate.acknowledge(candidateJobId,token,"already_applied") as any).duplicate,true);
 assert.equal((await candidate.offer(candidateJobId,"Emulator Tester",true)).status,"held");
 provider.status="refunded";provider.status_detail="refunded";
 provider.transactions.payments[0].status="refunded";
 provider.transactions.payments[0].status_detail="refunded";
 assert.equal((await candidate.reconcileAndQueue(candidateId)).state,"refunded");
 const after=await db.doc("pixCommercialDeliveries/"+candidateJobId).get();
 assert.equal(after.data()?.state,"refunded_after_ack");
 assert.equal(after.data()?.dispatchEnabled,false);
 console.log("PASS commercial-candidate local Firestore approval -> unique queue -> one lease -> idempotent ACK -> refund review; NO real dispatch");
}

// Real Firestore Emulator: process reboot while Core receipt may be lost.
// No automatic release and no duplicate offer, even after TTL.
{
 const {createCommercialStagingService} =
   await import("../server/delivery/commercialStagingService.ts");
 const restartId="f".repeat(64), restartJobId=restartId+"-0";
 const remote=ordersFixture(restartId,"25.00","approved");
 remote.live_mode=true;
 let testClock=Date.now();
 await db.doc("pixCommercialOrders/"+restartId).set({
   id:restartId,environment:"commercial",catalogValidated:true,
   providerOrderId:remote.id,collector:"42",currency:"BRL",
   totalCents:2500,gamertag:"Reboot Tester",state:"pending",
   lines:[{productType:"product",productId:"kit",quantity:1,
     reward:{version:1,items:[{itemId:"minecraft:diamond",quantity:3}]}}],
 });
 const factory=()=>createCommercialStagingService(db,{
   me:async()=>({id:42,netcraftTestAccount:false}),
   get:async()=>structuredClone(remote),
 },{keyring:{"bds_emulator":"not-real-hmac-secret-1234567890123456789"},
   now:()=>testClock});
 await factory().reconcileAndQueue(restartId);
 const first=await factory().offer(restartJobId,"Reboot Tester",true) as any;
 assert.equal(first.status,"offered");
 testClock+=121000;
 const restarted=factory();
 assert.equal((await restarted.recoverAfterRestart()).awaitingReceipt,1);
 assert.equal((await factory().diagnose(restartJobId)).state,"awaiting_receipt");
 assert.equal((await factory().offer(restartJobId,"Reboot Tester",true)).status,"held");
 assert.equal((await restarted.acknowledge(restartJobId,first.leaseToken,
   "already_applied")).status,"acknowledged");
 assert.equal((await factory().acknowledge(restartJobId,first.leaseToken,
   "already_applied") as any).duplicate,true);
 assert.equal((await factory().diagnose(restartJobId)).attempts,1);
 const history=(await db.collection("pixCommercialDeliveryAudit")
   .where("orderHash","==",crypto.createHash("sha256")
     .update(restartId).digest("hex")).get());
 assert.ok(history.docs.length>=3);
 for (const row of history.docs) {
   assert.equal(row.data()?.dispatchEnabled,false);
   assert.equal("leaseToken" in row.data(),false);
   assert.equal("gamertag" in row.data(),false);
   assert.equal("payload" in row.data(),false);
 }
 console.log("PASS Firestore Emulator restart recovery: durable lease, same-token receipt ACK, no duplicate offer, sanitized execution journal");
}

// HTTP cart quote must agree with the same authoritative catalog and
// coupon used by the transactional Pix creator. This is an isolated emulator.
const expressQuote = (await import("express")).default;
const { apiRouter } = await import("../server/routes/api.ts");
const quoteApp = expressQuote();
quoteApp.use(expressQuote.json());
quoteApp.use("/api",apiRouter);
const quoteServer=quoteApp.listen(0,"127.0.0.1");
await new Promise<void>((resolve,reject)=>{
 if(quoteServer.listening)return resolve();
 quoteServer.once("listening",resolve);
 quoteServer.once("error",reject);
});
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

// Each local checkout must receive its OWN fake provider order/payment IDs.
// Previously these fixtures reused one ORD/PAY for unrelated checkouts; the
// production-style uniqueness bindings correctly reject that collision.
const isolatedOrderFixture=(localId:string,total="25.00",state="pending")=>{
  const resource=ordersFixture(localId,total,state);
  const suffix=localId.slice(0,26).toUpperCase();
  resource.id="ORD"+suffix;
  resource.transactions.payments[0].id="PAY"+suffix;
  return resource;
};
let provider: any;
let calls = 0;
const gateway: any = {
  me: async () => ({ id: 42, netcraftTestAccount: true }),
  create: async (body: any, key: string) => {
    calls++;
    provider = isolatedOrderFixture(body.external_reference, body.total_amount);
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
// Real Firestore transaction test: while worker A is waiting for Mercado Pago,
// workers B/C must return the SAME reserved order without issuing another POST.
{
  const concurrentKey=crypto.randomUUID();
  const duplicateInput={...input,couponCode:""};
  let createCalls=0, providerKeys:string[]=[];
  let unblock!:()=>void, entered!:()=>void;
  const hold=new Promise<void>(resolve=>{unblock=resolve;});
  const providerStarted=new Promise<void>(resolve=>{entered=resolve;});
  const reservedResource=ordersFixture(
    crypto.createHash("sha256").update(concurrentKey).digest("hex"),
    "49.98",
  );
  reservedResource.id="ORD"+"Q".repeat(26);
  reservedResource.transactions.payments[0].id="PAY"+"Q".repeat(26);
  let currentResource=structuredClone(reservedResource);
  const concurrentGateway:any={
    me: async()=>({id:42,netcraftTestAccount:true}),
    create: async(_body:any,providerKey:string)=>{
      createCalls++;
      providerKeys.push(providerKey);
      entered();
      await hold;
      return structuredClone(reservedResource);
    },
    get: async(providerId:string)=>{
      assert.equal(providerId,reservedResource.id);
      return structuredClone(currentResource);
    },
  };
  const concurrentApi=pixService(db,concurrentGateway);
  const ongoing=concurrentApi.create(duplicateInput,concurrentKey);
  await providerStarted;
  const duplicates=await Promise.all([
    concurrentApi.create(duplicateInput,concurrentKey),
    concurrentApi.create(duplicateInput,concurrentKey),
  ]);
  assert.ok(duplicates.every(x=>x.state==="creating"));
  assert.equal(new Set(duplicates.map(x=>x.id)).size,1);
  assert.equal(createCalls,1,"only one provider POST before first response");
  unblock();
  const confirmed=await ongoing;
  assert.equal(confirmed.state,"pending");
  await Promise.all([
    concurrentApi.create(duplicateInput,concurrentKey),
    concurrentApi.create(duplicateInput,concurrentKey),
  ]);
  assert.equal(createCalls,1,"retries must not re-create paid/order resources");
  assert.equal(new Set(providerKeys).size,1);
  const concurrentId=confirmed.id;
  const binding=await db.doc("pixTestProviderOrderBindings/"+reservedResource.id).get();
  assert.equal(binding.data()?.orderId,concurrentId);
  currentResource=ordersFixture(concurrentId,"49.98","approved");
  currentResource.id=reservedResource.id;
  currentResource.transactions.payments[0].id=reservedResource.transactions.payments[0].id;
  await Promise.all(Array.from({length:5},()=>concurrentApi.reconcile(concurrentId)));
  const related=await db.collection("pixTestDeliveries").where("orderId","==",concurrentId).get();
  assert.equal(related.size,2,"one deterministic reward job per line");
  for(const job of related.docs) assert.equal(job.data().dispatchEnabled,false);
  const paymentBinding=await db.doc("pixTestProviderPaymentBindings/"+
    reservedResource.transactions.payments[0].id).get();
  assert.equal(paymentBinding.data()?.orderId,concurrentId);
  currentResource={...currentResource,status:"refunded",status_detail:"refunded",
    transactions:{payments:[{...currentResource.transactions.payments[0],
      status:"refunded",status_detail:"refunded"}]}};
  await Promise.all([concurrentApi.reconcile(concurrentId),concurrentApi.reconcile(concurrentId)]);
  const blocked=await db.collection("pixTestDeliveries").where("orderId","==",concurrentId).get();
  assert.equal(blocked.size,2);
  for(const job of blocked.docs) assert.equal(job.data().state,"blocked");
  assert.equal((await concurrentApi.view(concurrentId)).state,"refunded");
  console.log("PASS real Firestore concurrent checkout lease, unique provider bindings, repeat GETs and refund isolation");
}
provider = isolatedOrderFixture(first.id, "44.98", "approved");
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
provider = isolatedOrderFixture(first.id, "44.98", "refunded");
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
// Read-only admin HTTP projections must link Pix TEST orders and holds
// without leaking CPF, email, QR codes, provider payloads or reward drafts.
{
 const previousKey=process.env.ADMIN_KEYWORD;
 process.env.ADMIN_KEYWORD=crypto.randomBytes(20).toString("hex");
 const {generateAdminToken}=await import("../server/auth/admin.ts");
 const app=expressQuote();
 app.use(expressQuote.json());app.use("/api",apiRouter);
 const http=app.listen(0,"127.0.0.1");
 await new Promise<void>((resolve,reject)=>{http.once("listening",resolve);http.once("error",reject);});
 const url="http://127.0.0.1:"+(http.address() as any).port+"/api";
 try {
  for(const p of ["/admin/pix-test-orders","/admin/pix-test-deliveries"]){
   const unauthorized=await fetch(url+p);
   assert.equal(unauthorized.status,401);
   const invalid=await fetch(url+p,{headers:{Authorization:"Bearer bad-token"}});
   assert.equal(invalid.status,403);
  }
  const token=generateAdminToken();
  const get=async(p:string)=>fetch(url+p,{headers:{Authorization:"Bearer "+token}});
  const ordersResponse=await get("/admin/pix-test-orders");
  assert.equal(ordersResponse.status,200);
  assert.equal(ordersResponse.headers.get("cache-control"),"no-store");
  const orderSummaries=await ordersResponse.json();
  const order=orderSummaries.find((o:any)=>o.id===id);
  assert.ok(order);
  assert.equal(order.environment,"test");
  assert.equal(order.state,"refunded");
  assert.equal(order.totalCents,4498);
  assert.equal(order.linesCount,2);
  assert.equal(order.gamertag,"Local Tester");
  for(const k of ["email","cpf","qrCode","qrBase64","collector",
    "payload","receiver","line","reward","payment","buyer"])assert.equal(k in order,false,k);
  const deliveriesResponse=await get("/admin/pix-test-deliveries");
  assert.equal(deliveriesResponse.status,200);
  const deliverySummaries=await deliveriesResponse.json();
  const related=deliverySummaries.filter((d:any)=>d.orderId===id);
  assert.equal(related.length,2);
  for(const item of related){
   assert.equal(item.hold,"refunded");
   assert.equal(item.dispatchEnabled,false);
   for(const k of ["cpf","email","line","rewardDraft","coreDraft",
      "previewPlan","token","webhook","items","qrBase64"])assert.equal(k in item,false,k);
  }
  const {buildPixTestMonitor}=await import("../src/lib/pixTestMonitor.ts");
  const monitor=buildPixTestMonitor(orderSummaries,deliverySummaries);
  assert.equal(monitor.entries.find((e:any)=>e.order.id===id)?.deliveries.length,2);
  assert.equal(monitor.entries.find((e:any)=>e.order.id===id)?.status,"closed");
  console.log("PASS authenticated read-only admin Pix TEST monitoring, refund hold, payment/job join and no financial PII leaks");
 } finally {
  http.closeAllConnections();
  await new Promise<void>(resolve=>http.close(()=>resolve()));
  if(previousKey===undefined)delete process.env.ADMIN_KEYWORD;
  else process.env.ADMIN_KEYWORD=previousKey;
 }
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
provider = isolatedOrderFixture(nextId, "29.99", "approved");
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
provider = isolatedOrderFixture(nextId, "29.99", "refunded");
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
provider=isolatedOrderFixture(labId,"29.99","approved");
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
  provider=isolatedOrderFixture(labId,"29.99","refunded");
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


/* Isolated Preview coupon regression: tests only Firestore Emulator data.
 * No base coupons/products are modified; Pix grant dispatch remains OFF. */
{
 const previousStage=process.env.VERCEL_ENV;
 try {
  process.env.VERCEL_ENV="preview";
  const {readCoupon,listCoupons,findCouponByCode,couponWriteReference}=
    await import("../server/services/previewCoupons.ts");
  await db.doc("previewCoupons/preview-test").set({
   id:"preview-test",code:"PREVIEW20",active:true,
   discountType:"percentage",discountValue:20,
   minOrderValue:0,maxUses:2,usedCount:0,
  });
  await db.doc("previewCoupons/fixture").set({
   id:"fixture",code:"LOCALTEST",active:false,
   discountType:"percentage",discountValue:10,
   minOrderValue:0,maxUses:1,usedCount:0,
  });
  assert.equal(couponWriteReference("preview-test",db).path,"previewCoupons/preview-test");
  assert.equal((await readCoupon("fixture",undefined,db))?.active,false,
   "Preview override must hide live coupon availability");
  assert.equal((await db.doc("coupons/fixture").get()).data()?.active,true,
   "Production baseline must remain unchanged");
  assert.equal((await findCouponByCode("PREVIEW20",undefined,db))?.id,"preview-test");
  const previewList=await listCoupons(db);
  assert.equal(previewList.filter(x=>x.code==="PREVIEW20").length,1);

  const previewApp=expressQuote();
  previewApp.use(expressQuote.json());
  previewApp.use("/api",apiRouter);
  const previewHttp=previewApp.listen(0,"127.0.0.1");
  await new Promise<void>((resolve,reject)=>{
   previewHttp.once("listening",resolve);
   previewHttp.once("error",reject);
  });
  try {
   const base="http://127.0.0.1:"+(previewHttp.address() as any).port+"/api";
   const prevAdminKey=process.env.ADMIN_KEYWORD;
   process.env.ADMIN_KEYWORD="local-emulator-admin-only";
   try {
    const {generateAdminToken}=await import("../server/auth/admin.ts");
    const token=generateAdminToken();
    const adminCall=async(path:string,method:string,body?:unknown,authorized=true)=>{
     const response=await fetch(base+path,{
      method,headers:{"content-type":"application/json",
       ...(authorized?{authorization:"Bearer "+token}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
     });
     return {status:response.status,data:await response.json()};
    };
    const doc={id:"preview-crud",code:"CRUD15",discountType:"percentage",
     discountValue:15,minOrderValue:0,maxUses:3,active:true};
    assert.equal((await adminCall("/admin/coupons","POST",doc,false)).status,401);
    const created=await adminCall("/admin/coupons","POST",doc);
    assert.equal(created.status,201);
    assert.equal((await db.doc("coupons/preview-crud").get()).exists,false,
     "Preview coupon creation MUST NOT write baseline");
    assert.equal((await db.doc("previewCoupons/preview-crud").get()).exists,true);
    const loaded=await adminCall("/admin/coupons","GET");
    assert.equal(loaded.status,200);
    assert.equal(loaded.data.filter((c:any)=>c.id==="preview-crud").length,1);
    const modified=await adminCall("/admin/coupons/preview-crud","PUT",{
     ...doc,code:"CRUD18",discountValue:18,active:false
    });
    assert.equal(modified.status,200);
    assert.equal((await findCouponByCode("CRUD18",undefined,db))?.active,false);
    assert.equal(await findCouponByCode("CRUD15",undefined,db),null);
    assert.equal((await adminCall("/admin/coupons/preview-crud","DELETE")).status,200);
    assert.equal((await db.doc("previewCoupons/preview-crud").get()).data()?.__previewDeleted,true);
    assert.equal((await db.doc("coupons/preview-crud").get()).exists,false);
   }finally{
    if(prevAdminKey===undefined)delete process.env.ADMIN_KEYWORD;
    else process.env.ADMIN_KEYWORD=prevAdminKey;
   }
   const url=base+"/cart/quote";
   const reply=await fetch(url,{method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({lines:[{productId:"pix-fixture",productType:"product",quantity:1}],
     couponCode:"PREVIEW20"})});
   assert.equal(reply.status,200);
   const quoted=await reply.json();
   assert.equal(quoted.subtotalCents,1999);
   assert.equal(quoted.discountCents,400);
   assert.equal(quoted.totalCents,1599);
  }finally{
   previewHttp.closeAllConnections();
   await new Promise<void>(resolve=>previewHttp.close(()=>resolve()));
  }
  const previewKey=crypto.randomUUID();
  const previewPix=await pixService(db,gateway).create({
   ...input,
   couponCode:"PREVIEW20",
   lines:[{productId:"pix-fixture",productType:"product",quantity:1}],
  },previewKey);
  assert.equal(previewPix.totalCents,1599);
  assert.equal(previewPix.discountCents,400);
  assert.equal(previewPix.environment,"test");
  assert.equal((await db.doc("pixTestCouponUsage/preview-test").get())
   .data()?.reservedCount,1);
  assert.equal((await db.doc("coupons/fixture").get()).data()?.usedCount,0);

  await db.doc("previewCoupons/preview-test").set({
   id:"preview-test",__previewDeleted:true,
  });
  assert.equal(await readCoupon("preview-test",undefined,db),null);
  assert.equal(await findCouponByCode("PREVIEW20",undefined,db),null);
  assert.equal((await db.doc("coupons/fixture").get()).data()?.active,true);
  console.log("PASS Preview coupon copy-on-write, server quote and Pix Test price agreement; baseline unchanged");
 }finally{
  if(previousStage===undefined)delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV=previousStage;
 }
}

// Verify the webhook idempotency lease against REAL Firestore transactions.
// Same signed notification cannot be processed twice, even concurrently.
{
 const {claimWebhook,completeWebhook,releaseWebhook}=await import("../server/payments/webhookReplay.ts");
 const {ORD}=await import("./fixtures/pixOrders.ts");
 const timestamp=String(Date.now());
 const mkSignature=(id:string)=>`ts=${timestamp},v1=${crypto.createHmac("sha256","emulator-webhook-not-live")
  .update(`id:${ORD.toLowerCase()};request-id:${id};ts:${timestamp};`).digest("hex")}`;
 const requestId="fixture-emulator-unique";
 const signature=mkSignature(requestId);
 const claimed=await Promise.all([
  claimWebhook(db,ORD,requestId,signature),
  claimWebhook(db,ORD,requestId,signature),
 ]);
 assert.deepEqual(claimed.map(x=>x.status).sort(),["acquired","busy"]);
 const acquired=claimed.find(x=>x.status==="acquired")!;
 await completeWebhook(db,acquired);
 assert.equal((await claimWebhook(db,ORD,requestId,signature)).status,"duplicate");
 const newId="fixture-emulator-retry";
 const retrySignature=mkSignature(newId);
 const retry=await claimWebhook(db,ORD,newId,retrySignature);
 assert.equal(retry.status,"acquired");
 await releaseWebhook(db,retry);
 assert.equal((await claimWebhook(db,ORD,newId,retrySignature)).status,"acquired");
 console.log("PASS real Firestore webhook replay: concurrent lease, immutable done record and retry after safe release");
}

await db.terminate();
