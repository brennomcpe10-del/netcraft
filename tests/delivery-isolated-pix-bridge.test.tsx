import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryDB, ordersFixture, ORD, PAY } from "./fixtures/pixOrders.ts";
import { previewDeliveryPlan } from "../server/delivery/rewardPlan.ts";
import { draftCoreDelivery } from "../server/delivery/coreJobContract.ts";
import { createIsolatedPixOutboxBridge } from "../server/delivery/isolatedPixOutboxBridge.ts";

// Test runner never connects to external Firebase or Mercado Pago.
process.env.NODE_ENV="test";
process.env.FIRESTORE_EMULATOR_HOST="127.0.0.1:8085";
delete process.env.VERCEL_ENV;
delete process.env.MERCADOPAGO_ACCESS_TOKEN;
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const id="a".repeat(64);
const ref=(n: number)=>id+"-"+n;
const kit={productType:"product",productId:"kit-local",quantity:1,
  reward:{version:1,items:[{itemId:"minecraft:diamond",quantity:3},
    {itemId:"minecraft:iron_ingot",quantity:6}]}};
const vip={productType:"vip",productId:"pix-vip",quantity:1,duration:"30 dias"};
const mapping={ "pix-vip":{rankTag:"ncbr:vip_explorer",days:30,duration:"30 dias"} };
function fixture() {
  const db=memoryDB();
  const order:any={id,apiVersion:"orders-v1",environment:"test",state:"approved",
    receiverIsTestAccount:true,collector:"42",currency:"BRL",gamertag:"Lab Tester",
    providerOrderId:ORD,paymentId:PAY,totalCents:2500,
    expiresAt:new Date(Date.now()+60000).toISOString(),lines:[kit,vip]};
  const jobs=[kit,vip].map((line,i)=>{
    const plan=previewDeliveryPlan(line);
    return {id:ref(i),orderId:id,lineIndex:i,gamertag:"Lab Tester",
      environment:"test",state:"pending",dispatchEnabled:false,
      line,previewPlan:plan,coreDraft:draftCoreDelivery({
        deliveryId:ref(i),orderId:id,gamertag:"Lab Tester",
        orderState:"approved",environment:"test",plan,
      })};
  });
  const provider: any={me:async()=>({id:42,netcraftTestAccount:true}),
    get:async()=>ordersFixture(id,"25.00","approved")};
  async function seed(){
    await db.runTransaction(async (tx: any)=>{
      tx.create(db.collection("pixTestOrders").doc(id),order);
      jobs.forEach((job,i)=>tx.create(db.collection("pixTestDeliveries").doc(ref(i)),job));
    });
  }
  const update=async (collection:string,idToUpdate:string,partial:any)=>
    db.runTransaction(async (tx: any)=>tx.update(db.collection(collection).doc(idToUpdate),partial));
  const bridge=()=>createIsolatedPixOutboxBridge(db as any,provider,{vipMappings:mapping});
  return {db,order,jobs,provider,seed,bridge,update};
}
test("approved provider reverified kit: one offer, durable ACK and duplicate isolation",async()=>{
 const f=fixture();await f.seed();const svc=f.bridge();
 assert.equal((await svc.offer(ref(0),false) as any).reason,"player_offline");
 const grant=await svc.offer(ref(0),true);
 assert.equal(grant.status,"offered");
 assert.deepEqual((grant as any).payload.items,[
  {itemId:"minecraft:diamond",quantity:3},{itemId:"minecraft:iron_ingot",quantity:6}]);
 assert.equal((await svc.offer(ref(0),true) as any).reason,"manual_review_required");
 assert.equal((await svc.acknowledge(ref(0),"inventory_full") as any).reason,"executor_receipt_required");
 assert.equal((await svc.acknowledge(ref(0),"applied")).status,"acknowledged");
 assert.equal((await svc.acknowledge(ref(0),"already_applied") as any).duplicate,true);
 assert.equal((await f.bridge().offer(ref(0),true) as any).reason,"already_acknowledged");
 assert.deepEqual(await f.bridge().inspect(ref(0)),{status:"acknowledged",attempts:1});
});
test("Explorer requires explicit product-to-Core mapping and uses grant-time policy",async()=>{
 const f=fixture();await f.seed();const service=f.bridge();
 const result=await service.offer(ref(1),true);
 assert.equal(result.status,"offered");
 assert.equal((result as any).payload.kind,"vip");
 assert.equal((result as any).payload.days,30);
 assert.equal((result as any).payload.rankTag,"ncbr:vip_explorer");
 assert.equal((await service.acknowledge(ref(1),"applied")).status,"acknowledged");
 const unmapped=createIsolatedPixOutboxBridge(f.db as any,f.provider);
 assert.equal((await unmapped.verify(ref(1)) as any).reason,"vip_mapping_required");
 const wrong=createIsolatedPixOutboxBridge(f.db as any,f.provider,
  {vipMappings:{"pix-vip":{rankTag:"admin",days:30,duration:"30 dias"}}});
 assert.equal((await wrong.offer(ref(1),true) as any).reason,"vip_mapping_required");
});
test("pending, cancelled, refunded or invalid receiver cannot authorize Pix jobs",async()=>{
 for(const state of ["pending","refunded","cancelled"]){
  const f=fixture();await f.seed();await f.update("pixTestOrders",id,{state});
  assert.equal((await f.bridge().offer(ref(0),true)).status,"held");
 }
 const f=fixture();await f.seed();
 f.provider.get=async()=>ordersFixture(id,"25.00","pending");
 assert.equal((await f.bridge().offer(ref(0),true) as any).reason,"payment_not_confirmed");
 f.provider.get=async()=>ordersFixture(id,"25.00","approved");
 f.provider.me=async()=>({id:42,netcraftTestAccount:false});
 assert.equal((await f.bridge().offer(ref(0),true) as any).reason,"receiver_not_test");
 f.provider.me=async()=>({id:42,netcraftTestAccount:true});
 f.provider.get=async()=>ordersFixture("b".repeat(64),"25.00","approved");
 assert.equal((await f.bridge().offer(ref(0),true) as any).reason,"provider_verification_failed");
});
test("tampered line, mismatched plan and non-test dispatch remain denied",async()=>{
 const f=fixture();await f.seed();
 await f.update("pixTestDeliveries",ref(0),{dispatchEnabled:true});
 assert.equal((await f.bridge().offer(ref(0),true) as any).reason,"untrusted_or_unapproved_outbox");
 await f.update("pixTestDeliveries",ref(0),{dispatchEnabled:false,previewPlan:previewDeliveryPlan(vip)});
 assert.equal((await f.bridge().offer(ref(0),true) as any).reason,"plan_mismatch");
 const f2=fixture();await f2.seed();
 await f2.update("pixTestDeliveries",ref(0),{coreDraft:{payload:{kind:"items",items:[{itemId:"minecraft:diamond",quantity:64}]}}});
 assert.equal((await f2.bridge().offer(ref(0),true) as any).reason,"reward_not_authorized");
 const f3=fixture();await f3.seed();
 await f3.update("pixTestOrders",id,{receiverIsTestAccount:false});
 assert.equal((await f3.bridge().offer(ref(0),true) as any).reason,"untrusted_or_unapproved_outbox");
});
test("refund blocks outstanding offer; refund after acknowledged requires review",async()=>{
 const f=fixture();await f.seed();const bridge=f.bridge();
 assert.equal((await bridge.offer(ref(0),true)).status,"offered");
 assert.equal((await bridge.block(ref(0))).status,"blocked");
 assert.equal((await bridge.acknowledge(ref(0),"applied") as any).reason,"blocked");
 assert.equal((await bridge.offer(ref(1),true)).status,"offered");
 assert.equal((await bridge.acknowledge(ref(1),"applied")).status,"acknowledged");
 assert.equal((await bridge.block(ref(1))).status,"refunded_after_ack");
 assert.equal((await bridge.offer(ref(1),true)).status,"held");
});
test("bridge refuses production/preview and real secrets before touching outbox",()=>{
 const f=fixture();
 process.env.VERCEL_ENV="preview";
 assert.throws(()=>f.bridge(),/isolated_firestore_emulator_required/);
 delete process.env.VERCEL_ENV;
 process.env.MERCADOPAGO_ACCESS_TOKEN="TEST_secret";
 assert.throws(()=>f.bridge(),/isolated_firestore_emulator_required/);
 delete process.env.MERCADOPAGO_ACCESS_TOKEN;
});
