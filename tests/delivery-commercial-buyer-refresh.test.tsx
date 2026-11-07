// Reconciliation regression: all payments and Firestore are in-memory mocks.
// Never accesses Mercado Pago, MagnoHost, Vercel Production or real accounts.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {memoryDB,ordersFixture,ORD} from "./fixtures/pixOrders.ts";
import {makeRewardRegistry} from "../server/delivery/verifiedRewardRegistry.ts";
import {createNetCraftCommercialCheckout} from "../server/delivery/commercialCheckoutService.ts";
import {createNetCraftCommercialNickGateway} from "../server/delivery/commercialNickGateway.ts";
import {refreshCommercialBuyerOrder}
  from "../server/delivery/commercialBuyerRefresh.ts";

const KEY="buyer-key-for-lost-webhook-123456";
const ID=crypto.createHash("sha256").update("netcraft-commercial-v1:"+KEY)
  .digest("hex");
const VIP="vip-1791128040888-vvek";
const ENV=["NODE_ENV","VERCEL_ENV","FIRESTORE_EMULATOR_HOST",
  "NETCRAFT_DELIVERY_RELEASE_APPROVED","NCBR_COMMERCIAL_MP_ACCESS_TOKEN",
  "NCBR_COMMERCIAL_FIREBASE_SERVICE_ACCOUNT_JSON"];
async function inMockCommerce(fn:()=>Promise<void>){
  const before=Object.fromEntries(ENV.map(k=>[k,process.env[k]]));
  try{
    process.env.NODE_ENV="production";
    process.env.VERCEL_ENV="production";
    delete process.env.FIRESTORE_EMULATOR_HOST;
    process.env.NETCRAFT_DELIVERY_RELEASE_APPROVED="PRIVATE_GATEWAY_REVIEWED";
    process.env.NCBR_COMMERCIAL_MP_ACCESS_TOKEN="MOCK_NEVER_USED";
    process.env.NCBR_COMMERCIAL_FIREBASE_SERVICE_ACCOUNT_JSON="MOCK_NEVER_USED";
    await fn();
  }finally{
    for(const k of ENV){
      if(before[k]===undefined)delete process.env[k];
      else process.env[k]=before[k];
    }
  }
}
function scenario(){
  const db=memoryDB() as any;
  let providerState="pending", release=true, requests=0, posts=0;
  const registry=makeRewardRegistry([{kind:"vip",productId:VIP,
    tier:"explorer",rankTag:"ncbr:vip_explorer",duration:"30 dias",days:30}]);
  const approvedPrices=[{productId:VIP,productType:"vip" as const,priceCents:490}];
  const provider:any={
    me:async()=>({id:42,netcraftTestAccount:false}),
    createPixOrder:async(req:any,reference:string)=>{
      posts++;
      assert.equal(reference,ID);
      assert.equal(req.total_amount,"4.90");
      return {id:ORD,external_reference:ID,user_id:"42",
        type:"online",total_amount:"4.90"};
    },
    get:async()=>{
      requests++;
      return {...ordersFixture(ID,"4.90",providerState),live_mode:true};
    },
  };
  const checkout=createNetCraftCommercialCheckout({
    db,provider,registry,approvedPrices,
    releaseApproved:()=>release,
  });
  const delivery=createNetCraftCommercialNickGateway({
    db,provider,registry,approvedPrices,
    bdsOpaqueToken:"T".repeat(64),
    privateHmacKey:"H".repeat(64),
    webhookSecret:"W".repeat(64),
    authorizeOrderForDispatch:async(o:any)=>release &&
      o.checkoutOrigin==="netcraft_commercial_checkout_v1" &&
      typeof o.requestHash==="string"&&/^[a-f0-9]{64}$/.test(o.requestHash),
  });
  const refresh=()=>refreshCommercialBuyerOrder({checkout,delivery},KEY,ID);
  const create=()=>checkout.create({
    gamertag:"Halzin5212",email:"buyer@example.com",
    lines:[{productId:VIP,quantity:1}]},KEY);
  const job=()=>db.records.get("pixCommercialDeliveries/"+ID+"-0");
  return {db,create,refresh,job,
    setProvider:(v:string)=>{providerState=v;},
    stop:()=>{release=false;},requests:()=>requests,posts:()=>posts};
}
test("lost webhook: buyer refresh detects paid Orders GET and queues VIP once",async()=>{
  await inMockCommerce(async()=>{
    const f=scenario();
    const created=await f.create();
    assert.equal(created.state,"pending");
    assert.equal(f.job(),undefined);
    const pending=await f.refresh();
    assert.equal(pending.state,"pending");
    assert.equal(f.job(),undefined);
    f.setProvider("approved");
    const paid=await f.refresh();
    assert.equal(paid.state,"approved");
    assert.equal((paid as any).deliveryStatus,"queued");
    assert.equal(f.job()?.state,"queued");
    assert.equal(f.job()?.payload.rankTag,"ncbr:vip_explorer");
    assert.equal(f.job()?.payload.days,30);
    const again=await f.refresh();
    assert.equal(again.state,"approved");
    assert.equal(f.job()?.state,"queued");
    assert.equal(f.posts(),1);
    assert.ok(f.requests()>=4);
    // Only a server-side receipt may confirm actual delivery.
    f.db.records.set("pixCommercialDeliveries/"+ID+"-0",
      {...f.job(),state:"acknowledged"});
    assert.equal((await f.refresh() as any).deliveryStatus,"delivered");
  });
});
test("refund after ACK is rechecked on buyer refresh and requires review",async()=>{
  await inMockCommerce(async()=>{
    const f=scenario();
    await f.create();
    f.setProvider("approved");
    await f.refresh();
    f.db.records.set("pixCommercialDeliveries/"+ID+"-0",
      {...f.job(),state:"acknowledged"});
    f.setProvider("refunded");
    const returned=await f.refresh();
    assert.equal(returned.state,"refunded");
    assert.equal(f.job()?.state,"refunded_after_ack");
    assert.notEqual((returned as any).deliveryStatus,"delivered");
    assert.equal(f.posts(),1);
  });
});
test("cancelled payment never creates a VIP and the release gate still blocks",async()=>{
  await inMockCommerce(async()=>{
    const f=scenario();
    await f.create();
    f.setProvider("cancelled");
    const cancelled=await f.refresh();
    assert.equal(cancelled.state,"cancelled");
    assert.equal(f.job(),undefined);
    f.stop();
    await assert.rejects(()=>f.refresh(),/commercial_checkout_release_blocked/);
  });
});
test("order-key mismatch or missing provider binding cannot reconcile",async()=>{
  await inMockCommerce(async()=>{
    const f=scenario();
    const missing=await f.refresh();
    assert.equal((missing as any).status,"not_found");
    assert.equal(f.requests(),0);
    await assert.rejects(()=>refreshCommercialBuyerOrder({
      checkout:{viewByCheckoutKey:async()=>({id:"f".repeat(64),
        providerOrderId:ORD})},
      delivery:{reconcileVerifiedOrder:async()=>{throw Error("must_not_call");}},
    },KEY,ID),/checkout_order_binding_mismatch/);
  });
});
