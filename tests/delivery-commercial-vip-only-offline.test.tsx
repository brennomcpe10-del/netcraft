// Real store IDs and prices; strictly OFFLINE, SYNTHETIC provider + BDS clone.
// No Mercado Pago network request, actual buyer, checkout, or Minecraft grant.
import {test} from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {memoryDB,ORD,ordersFixture} from "./fixtures/pixOrders.ts";
import {netcraftVipOnlyCandidate,createNetcraftVipOnlyTestCatalog}
  from "../server/delivery/netcraftVipOnlyCandidate.ts";
import {createNetCraftCommercialCheckout}
  from "../server/delivery/commercialCheckoutService.ts";
import {createNetCraftCommercialNickGateway}
  from "../server/delivery/commercialNickGateway.ts";
import {createCommercialNickReleaseService}
  from "../server/delivery/commercialNickReleaseService.ts";
import {createOpaqueBdsNickReleaseAdapter}
  from "../server/delivery/bdsOpaqueNickReleaseAdapter.ts";
// @ts-ignore — isolated NetCraftCore Bedrock executor is a LAB-only JS fixture
import {createVerifiedLabExecutor}
  from "../minecraft/delivery-core-v2324-fixture/verified_executor.js";

const time=Date.parse("2026-11-05T18:30:00Z");
const bdsToken="T".repeat(64),hmacKey="H".repeat(64),webhookSecret="W".repeat(64);
const envKeys=["NODE_ENV","VERCEL_ENV","FIRESTORE_EMULATOR_HOST",
  "NETCRAFT_DELIVERY_RELEASE_APPROVED","NCBR_COMMERCIAL_MP_ACCESS_TOKEN",
  "NCBR_COMMERCIAL_FIREBASE_SERVICE_ACCOUNT_JSON"];

test("only the three exact store VIPs and prices qualify for a delivery",()=>{
  const catalog=createNetcraftVipOnlyTestCatalog();
  assert.deepEqual(netcraftVipOnlyCandidate.map(x=>x.name),
    ["Explorer","Elite","Supreme"]);
  assert.deepEqual(netcraftVipOnlyCandidate.map(x=>x.priceCents),
    [490,1290,2490]);
  assert.equal(Object.keys(catalog.registry).length,3);
  assert.equal(catalog.prices.length,3);
  for(const p of netcraftVipOnlyCandidate){
    assert.doesNotThrow(()=>catalog.validatePrice({totalCents:p.priceCents,
      lines:[{productType:"vip",productId:p.productId,quantity:1,duration:"30 dias"}]}));
    assert.throws(()=>catalog.validatePrice({totalCents:1,
      lines:[{productType:"vip",productId:p.productId,quantity:1,duration:"30 dias"}]}),
      /commercial_order_amount_mismatch/);
    assert.throws(()=>catalog.validatePrice({totalCents:p.priceCents,
      lines:[{productType:"vip",productId:p.productId,quantity:2,duration:"30 dias"}]}),
      /commercial_product_price_not_authorized/);
  }
  // Deleted later or not, these experimental products can never grant a VIP.
  for(const productId of ["prod-1791210646508-v59f",
    "prod-531ded65-a0a7-4485-aeae-f6965f86fc5f","vip-made-up"]){
    assert.throws(()=>catalog.validatePrice({totalCents:990,lines:[
      {productType:"product",productId,quantity:1}]}),
      /commercial_product_price_not_authorized/);
  }
  assert.throws(()=>catalog.validatePrice({totalCents:490,
    discountCents:1,lines:[{productType:"vip",
      productId:netcraftVipOnlyCandidate[0].productId,quantity:1,duration:"30 dias"}]}),
    /commercial_order_price_not_authorized/);
});

test("each approved VIP pays its own total, queues once, grants once and ACKs once",async()=>{
  const prior=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
  try{
    process.env.NODE_ENV="production";
    process.env.VERCEL_ENV="production";
    delete process.env.FIRESTORE_EMULATOR_HOST;
    process.env.NETCRAFT_DELIVERY_RELEASE_APPROVED="PRIVATE_GATEWAY_REVIEWED";
    // Local test strings. They do NOT unlock real credentials or network.
    process.env.NCBR_COMMERCIAL_MP_ACCESS_TOKEN="MOCK_ONLY_NO_PROVIDER";
    process.env.NCBR_COMMERCIAL_FIREBASE_SERVICE_ACCOUNT_JSON="MOCK_ONLY_MEMORY_DB";
    const {registry,prices,validatePrice}=createNetcraftVipOnlyTestCatalog();
    for(const vip of netcraftVipOnlyCandidate){
      const db=memoryDB() as any;
      const key="vip-only-offline-"+vip.tier+"-012345678901234";
      const internalId=crypto.createHash("sha256")
        .update("netcraft-commercial-v1:"+key).digest("hex");
      const price=(vip.priceCents/100).toFixed(2);
      let state="pending",created=0,getCalls=0;
      const provider:any={
        me:async()=>({id:"42",netcraftTestAccount:false}),
        createPixOrder:async(body:any,id:string)=>{
          created++;
          assert.equal(id,internalId);
          assert.equal(body.total_amount,price);
          assert.equal(body.external_reference,internalId);
          return {id:ORD,external_reference:id,user_id:"42",
            type:"online",processing_mode:"automatic",total_amount:price};
        },
        get:async(orderId:string)=>{
          getCalls++;
          assert.equal(orderId,ORD);
          return {...ordersFixture(internalId,price,state),live_mode:true};
        },
      };
      const checkout=createNetCraftCommercialCheckout({
        db,provider,registry,approvedPrices:prices,
        releaseApproved:()=>true,now:()=>time});
      const request={gamertag:"Halzin5212",email:"offline-buyer@example.invalid",
        lines:[{productId:vip.productId,quantity:1}]};
      const before=await checkout.create(request,key);
      assert.equal(before.state,"pending",vip.tier);
      assert.equal(before.totalCents,vip.priceCents,vip.tier);
      assert.equal(created,1);
      // Idempotent checkout: same key cannot create a second Pix order.
      const repeated=await checkout.create(request,key);
      assert.equal(repeated.state,"pending");
      assert.equal(created,1);
      const gateway=createNetCraftCommercialNickGateway({
        db,provider,registry,approvedPrices:prices,
        bdsOpaqueToken:bdsToken,privateHmacKey:hmacKey,webhookSecret,
        now:()=>time,authorizeOrderForDispatch:async(order:any)=>
          order.checkoutOrigin==="netcraft_commercial_checkout_v1" &&
          /^[a-f0-9]{64}$/.test(order.requestHash||""),
      });
      // No VIP can be queued before accredited provider GET.
      const pending=await gateway.reconcileVerifiedOrder(internalId);
      assert.equal(pending.created,0);
      assert.equal(db.records.has("pixCommercialDeliveries/"+internalId+"-0"),false);
      state="approved";
      const requestId="vip-"+vip.tier+"-event";
      const ts=String(Math.floor(time/1000));
      const digest=crypto.createHmac("sha256",webhookSecret)
        .update("id:"+ORD.toLowerCase()+";request-id:"+requestId+";ts:"+ts+";")
        .digest("hex");
      const event={orderId:ORD,requestId,type:"order",
        signature:"ts="+ts+",v1="+digest};
      const confirmation=await gateway.reconcileSignedOrderNotification(event);
      assert.equal(confirmation.state,"approved");
      assert.equal(confirmation.created,1);
      assert.equal((await gateway.reconcileSignedOrderNotification(event)).created,0);
      const service=createCommercialNickReleaseService(db,provider,{
        registry,validateOrder:validatePrice,
        authorizeOrderForDispatch:async(order:any)=>
          order.checkoutOrigin==="netcraft_commercial_checkout_v1" &&
          /^[a-f0-9]{64}$/.test(order.requestHash||""),
        keyring:{netcraft_nick_private:hmacKey},now:()=>time});
      const adapter=createOpaqueBdsNickReleaseAdapter({
        service,secret:bdsToken,hmacKey,now:()=>time});
      let nonce=0;
      const send=(action:"poll"|"ack",body:unknown)=>adapter({
        method:"POST",action,transportVerified:true,body:JSON.stringify(body),
        headers:{"x-nc-bds-token":bdsToken,"x-nc-timestamp":String(time),
          "x-nc-nonce":(++nonce).toString(16).padStart(32,"0")},
      });
      assert.equal((await send("poll",{gamertag:"AnotherPlayer",online:true}) as any)
        .deliveries.length,0);
      const offer=await send("poll",{gamertag:"Halzin5212",online:true}) as any;
      assert.equal(offer.deliveries.length,1);
      const lease=offer.deliveries[0];
      assert.equal(lease.payload.kind,"vip");
      assert.equal(lease.payload.rankTag,vip.rankTag);
      assert.equal(lease.payload.days,30);
      let grantCount=0,currentTier:string|null=null;
      const receipts=new Map<string,string>();
      const player={isValid:true,id:"linked-simulated-account",name:"Halzin5212"};
      const world={
        getAllPlayers:()=>[player],
        getDynamicProperty:(id:string)=>receipts.get(id),
        setDynamicProperty:(id:string,data:string)=>{receipts.set(id,data);},
      };
      const Server={VIPSystem:{
        vipRanks:new Map([[vip.rankTag,{}]]),
        getVIP:()=>currentTier?{rankTag:currentTier}:null,
        grantDeliveryVIPLab:(_name:string,tag:string,days:number)=>{
          assert.equal(tag,vip.rankTag);assert.equal(days,30);
          grantCount++;currentTier=tag;return "applied";
        },
      }};
      const core=()=>createVerifiedLabExecutor({
        world,Server,ItemStack:class{},isOfflineClone:()=>true,
        verifyLinkedPlayer:(p:any,j:any)=>
          p.id===player.id&&p.name===j.gamertag,
      });
      assert.equal(core().execute(lease.payload).status,"applied");
      assert.equal(core().execute(lease.payload).status,"already_applied");
      assert.equal(grantCount,1,vip.tier);
      const acknowledgement=await send("ack",{
        deliveryId:lease.payload.id,leaseToken:lease.leaseToken,
        result:"applied"}) as any;
      assert.equal(acknowledgement.status,"acknowledged");
      assert.equal((await send("poll",{gamertag:"Halzin5212",online:true}) as any)
        .deliveries.length,0);
      assert.equal(grantCount,1);
      // A subsequent refund requires review but must never re-issue the VIP.
      state="refunded";
      const refunded=await gateway.reconcileVerifiedOrder(internalId);
      assert.equal(refunded.state,"refunded");
      assert.equal((await send("poll",{gamertag:"Halzin5212",online:true}) as any)
        .deliveries.length,0);
      assert.equal(grantCount,1);
      assert.ok(getCalls>=3);
    }
  }finally{
    for(const k of envKeys){
      if(prior[k]===undefined)delete process.env[k];
      else process.env[k]=prior[k];
    }
  }
});
