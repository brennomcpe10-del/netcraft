// Unit tests ONLY: fictitious payment provider and in-memory database.
// No external checkout, no BDS server, no real credentials or production grant.
import {test} from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {memoryDB,ordersFixture,ORD} from "./fixtures/pixOrders.ts";
import {makeRewardRegistry} from "../server/delivery/verifiedRewardRegistry.ts";
import {commercialPriceValidator} from "../server/delivery/commercialCatalogReleaseApproval.ts";
import {createCommercialNickReleaseService} from "../server/delivery/commercialNickReleaseService.ts";
import {createNetCraftCommercialNickGateway} from "../server/delivery/commercialNickGateway.ts";
import {createOpaqueBdsNickReleaseAdapter} from "../server/delivery/bdsOpaqueNickReleaseAdapter.ts";

const ID="b".repeat(64), NOW=Date.parse("2026-11-05T12:00:00Z");
const TOKEN="T".repeat(64), HMAC="H".repeat(64), WEBHOOK="W".repeat(64);
const REGISTRY=makeRewardRegistry([
  {kind:"vip",productId:"approved-explorer",tier:"explorer",
    rankTag:"ncbr:vip_explorer",duration:"30 dias",days:30},
  {kind:"items",productId:"approved-kit",items:[
    {itemId:"minecraft:diamond",quantity:4}]},
]);
const PRICES=[
  {productId:"approved-explorer",productType:"vip" as const,priceCents:490},
  {productId:"approved-kit",productType:"product" as const,priceCents:600},
];
const envNames=["NODE_ENV","VERCEL_ENV","FIRESTORE_EMULATOR_HOST",
  "NETCRAFT_DELIVERY_RELEASE_APPROVED","MERCADOPAGO_ACCESS_TOKEN",
  "MP_ACCESS_TOKEN","GOOGLE_APPLICATION_CREDENTIALS","FIREBASE_SERVICE_ACCOUNT_JSON"];
async function withPrivateFixture(fn:()=>Promise<void>){
  const saved=Object.fromEntries(envNames.map(k=>[k,process.env[k]]));
  try{
    process.env.NODE_ENV="production";
    delete process.env.VERCEL_ENV;
    delete process.env.FIRESTORE_EMULATOR_HOST;
    process.env.NETCRAFT_DELIVERY_RELEASE_APPROVED="PRIVATE_GATEWAY_REVIEWED";
    process.env.MERCADOPAGO_ACCESS_TOKEN="APP_USR-FAKE-UNIT-TEST-ONLY";
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON='{"fixture":true}';
    delete process.env.MP_ACCESS_TOKEN;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    await fn();
  }finally{
    for(const k of envNames){
      if(saved[k]===undefined)delete process.env[k];
      else process.env[k]=saved[k];
    }
  }
}
function fixture(kind:"vip"|"kit"="vip"){
  const db=memoryDB() as any;
  let canRelease=true;
  let providerState="approved";
  const price=kind==="vip"?490:600;
  const order={id:ID,environment:"commercial",catalogValidated:true,
    providerOrderId:ORD,collector:"42",totalCents:price,currency:"BRL",
    gamertag:"Halzin5212",state:"pending",lines:kind==="vip"
      ? [{productType:"vip",productId:"approved-explorer",quantity:1,duration:"30 dias"}]
      : [{productType:"product",productId:"approved-kit",quantity:1,reward:{
          version:1,items:[{itemId:"minecraft:diamond",quantity:4}]}}]};
  db.records.set("pixCommercialOrders/"+ID,structuredClone(order));
  const provider:any={
    me:async()=>({id:42,netcraftTestAccount:false}),
    get:async()=>Object.assign(ordersFixture(ID,(price/100).toFixed(2),providerState),
      {live_mode:true}),
  };
  const authorize=async()=>canRelease;
  const gateway=createNetCraftCommercialNickGateway({db,provider,registry:REGISTRY,
    approvedPrices:PRICES,bdsOpaqueToken:TOKEN,privateHmacKey:HMAC,
    webhookSecret:WEBHOOK,authorizeOrderForDispatch:authorize,now:()=>NOW});
  const service=createCommercialNickReleaseService(db,provider,{
    registry:REGISTRY,validateOrder:commercialPriceValidator(PRICES,REGISTRY),
    authorizeOrderForDispatch:authorize,keyring:{netcraft_nick_private:HMAC},
    now:()=>NOW,
  });
  const adapter=createOpaqueBdsNickReleaseAdapter({service,secret:TOKEN,
    hmacKey:HMAC,now:()=>NOW});
  let nonce=0;
  function send(action:"poll"|"ack"|"nack",body:unknown,overrides:any={}){
    return adapter({
      action,method:"POST",transportVerified:true,body:JSON.stringify(body),
      headers:{
        "x-nc-bds-token":TOKEN,
        "x-nc-timestamp":String(NOW),
        "x-nc-nonce":(++nonce).toString(16).padStart(32,"0"),
        ...overrides,
      },
    });
  }
  const signed=(requestId="evt-123")=>{
    const ts=String(Math.floor(NOW/1000));
    return {orderId:ORD,requestId,type:"order",
      signature:`ts=${ts},v1=${crypto.createHmac("sha256",WEBHOOK)
        .update(`id:${ORD.toLowerCase()};request-id:${requestId};ts:${ts};`)
        .digest("hex")}`};
  };
  return {db,order,gateway,service,send,signed,
    setRelease:(v:boolean)=>{canRelease=v;},
    setProvider:(v:string)=>{providerState=v;},
    job:ID+"-0",
  };
}
test("commercial pricing rejects fake prices, discounts and unknown catalog IDs",()=>{
  const validate=commercialPriceValidator(PRICES,REGISTRY);
  const base={totalCents:490,lines:[
    {productId:"approved-explorer",productType:"vip",quantity:1,duration:"30 dias"}]};
  assert.doesNotThrow(()=>validate(base));
  assert.throws(()=>validate({...base,totalCents:1}),/amount_mismatch/);
  assert.throws(()=>validate({...base,discountCents:400}),/price_not_authorized/);
  assert.throws(()=>validate({...base,lines:[{...base.lines[0],productId:"fake"}]}),
    /product_price_not_authorized/);
  assert.throws(()=>validate({...base,lines:[{...base.lines[0],quantity:2}]}),
    /product_price_not_authorized/);
  assert.throws(()=>commercialPriceValidator([
    {...PRICES[0],priceCents:0}],REGISTRY),/invalid_commercial_price_approval/);
});
test("private signed Orders notification -> unique queue -> opaque poll -> ACK exactly once",async()=>{
  await withPrivateFixture(async()=>{
    const f=fixture();
    const one=await f.gateway.reconcileSignedOrderNotification(f.signed());
    assert.deepEqual(one,{state:"approved",created:1,dispatchEnabled:true});
    const again=await f.gateway.reconcileSignedOrderNotification(f.signed("evt-456"));
    assert.deepEqual(again,{state:"approved",created:0,dispatchEnabled:true});
    const offered=await f.send("poll",{gamertag:"Halzin5212",online:true}) as any;
    assert.equal(offered.schema,1);
    assert.equal(offered.simulation,false);
    assert.equal(offered.dispatchEnabled,true);
    assert.equal(offered.deliveries.length,1);
    const lease=offered.deliveries[0];
    assert.equal(lease.payload.rankTag,"ncbr:vip_explorer");
    assert.equal(lease.payload.days,30);
    assert.equal(lease.payload.gamertag,"Halzin5212");
    assert.equal(lease.dispatchEnabled,true);
    // A verified BDS Core receipt must precede ACK. Simulate this here;
    // no Minecraft or remote provider was actually contacted.
    let coreGrants=0;const receipts=new Map<string,string>();
    const coreApply=(job:any)=>{
      if(receipts.get(job.id)==="applied")return "already_applied";
      receipts.set(job.id,"started");coreGrants++;receipts.set(job.id,"applied");
      return "applied";
    };
    assert.equal(coreApply(lease.payload),"applied");
    assert.equal(coreApply(lease.payload),"already_applied");
    assert.equal(coreGrants,1);
    assert.equal((await f.send("ack",{deliveryId:f.job,
      leaseToken:lease.leaseToken,result:"applied"}) as any).status,"acknowledged");
    assert.equal((await f.send("poll",{gamertag:"Halzin5212",online:true}) as any).deliveries.length,0);
    assert.equal(f.db.records.get("pixCommercialDeliveries/"+f.job).state,"acknowledged");
  });
});
test("private gateway refuses forged webhook, wrong prices and cancelled provider",async()=>{
  await withPrivateFixture(async()=>{
    const f=fixture();
    await assert.rejects(()=>f.gateway.reconcileSignedOrderNotification({
      ...f.signed(),signature:"ts=1783500000,v1="+("0".repeat(64))}),
      /unverified_commercial_notification/);
    assert.equal(f.db.records.has("pixCommercialDeliveries/"+f.job),false);
    f.db.records.get("pixCommercialOrders/"+ID).totalCents=1;
    await assert.rejects(()=>f.gateway.reconcileVerifiedOrder(ID),/amount_mismatch/);
    assert.equal(f.db.records.has("pixCommercialDeliveries/"+f.job),false);
    f.db.records.get("pixCommercialOrders/"+ID).totalCents=490;
    f.setProvider("cancelled");
    assert.deepEqual(await f.gateway.reconcileVerifiedOrder(ID),
      {state:"cancelled",created:0,dispatchEnabled:false});
    assert.equal((await f.send("poll",{gamertag:"Halzin5212",online:true}) as any).deliveries.length,0);
  });
});
test("offline nick, forged token and revoked release cannot yield an item offer",async()=>{
  await withPrivateFixture(async()=>{
    const f=fixture("kit");
    await f.gateway.reconcileVerifiedOrder(ID);
    assert.equal((await f.send("poll",{gamertag:"Halzin5212",online:false}) as any).deliveries.length,0);
    assert.equal((await f.send("poll",{gamertag:"WrongName",online:true}) as any).deliveries.length,0);
    await assert.rejects(()=>f.send("poll",{gamertag:"Halzin5212",online:true},
      {"x-nc-bds-token":"F".repeat(64)}),/unauthorized_bds_request/);
    f.setRelease(false);
    assert.equal((await f.send("poll",{gamertag:"Halzin5212",online:true}) as any).deliveries.length,0);
    f.setRelease(true);
    const result=await f.send("poll",{gamertag:"Halzin5212",online:true}) as any;
    assert.equal(result.deliveries.length,1);
    assert.deepEqual(result.deliveries[0].payload.items,
      [{itemId:"minecraft:diamond",quantity:4}]);
  });
});
test("production-only gateway fails closed without explicit private release controls",async()=>{
  await withPrivateFixture(async()=>{
    delete process.env.NETCRAFT_DELIVERY_RELEASE_APPROVED;
    const db=memoryDB() as any;
    assert.throws(()=>createNetCraftCommercialNickGateway({db,
      provider:{me:async()=>({id:"42",netcraftTestAccount:false}),get:async()=>({})},
      registry:REGISTRY,approvedPrices:PRICES,bdsOpaqueToken:TOKEN,
      privateHmacKey:HMAC,webhookSecret:WEBHOOK,
      authorizeOrderForDispatch:async()=>true,now:()=>NOW}),/private_gateway_release_blocked/);
  });
});


test("commercial API health probe never activates payments or discloses secrets",async()=>{
  const {default:express}=await import("express");
  const {commercialPixReleaseRouter}=await import("../server/routes/commercialRelease.ts");
  const app=express();
  app.use("/pix/commercial",commercialPixReleaseRouter);
  let server:ReturnType<typeof app.listen>;
  await new Promise<void>(resolve=>{
    server=app.listen(0,"127.0.0.1",resolve);
  });
  try{
    const address=server!.address();
    assert.ok(address&&typeof address!=="string");
    const response=await fetch(`http://127.0.0.1:${address.port}/pix/commercial/health`);
    assert.equal(response.status,200);
    assert.equal(response.headers.get("cache-control"),"no-store");
    const payload=await response.json();
    assert.deepEqual(payload,{
      component:"netcraft-commercial-api",
      status:"code_deployed_only",
      paymentOrDeliveryAuthorization:false,
    });
  }finally{
    await new Promise<void>((resolve,reject)=>server!.close(err=>err?reject(err):resolve()));
  }
});
