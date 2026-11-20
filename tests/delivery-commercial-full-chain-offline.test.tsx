// Full OFFLINE, MOCKED checkout -> provider GET -> gateway -> Core -> ACK.
// No external Mercado Pago call, no Vercel deploy, no Minecraft server.
import {test} from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {memoryDB,ORD,ordersFixture} from "./fixtures/pixOrders.ts";
import {makeRewardRegistry} from "../server/delivery/verifiedRewardRegistry.ts";
import {createNetCraftCommercialCheckout} from "../server/delivery/commercialCheckoutService.ts";
import {createNetCraftCommercialNickGateway} from "../server/delivery/commercialNickGateway.ts";
import {createOpaqueBdsNickReleaseAdapter}
  from "../server/delivery/bdsOpaqueNickReleaseAdapter.ts";
// @ts-ignore -- Bedrock-independent LAB executor is pure JS
import {createVerifiedLabExecutor} from "../minecraft/delivery-core-v2324-fixture/verified_executor.js";

const key="checkout-for-nick-0123456789012345";
const orderId=crypto.createHash("sha256")
  .update("netcraft-commercial-v1:"+key).digest("hex");
const token="T".repeat(64),hmac="H".repeat(64),webhook="W".repeat(64);
const now=Date.parse("2026-11-05T12:00:00Z");
const envs=["NODE_ENV","VERCEL_ENV","FIRESTORE_EMULATOR_HOST",
  "NETCRAFT_DELIVERY_RELEASE_APPROVED","NCBR_COMMERCIAL_MP_ACCESS_TOKEN",
  "NCBR_COMMERCIAL_FIREBASE_SERVICE_ACCOUNT_JSON"];
test("mock live checkout -> verified paid webhook -> BDS nonce -> Core VIP -> one ACK",async()=>{
  const before=Object.fromEntries(envs.map(k=>[k,process.env[k]]));
  try {
    process.env.NODE_ENV="production";
    process.env.VERCEL_ENV="production";
    delete process.env.FIRESTORE_EMULATOR_HOST;
    process.env.NETCRAFT_DELIVERY_RELEASE_APPROVED="PRIVATE_GATEWAY_REVIEWED";
    process.env.NCBR_COMMERCIAL_MP_ACCESS_TOKEN="MOCK_ENV_ONLY";
    process.env.NCBR_COMMERCIAL_FIREBASE_SERVICE_ACCOUNT_JSON="MOCK_ENV_ONLY";
    const db=memoryDB() as any;
    const registry=makeRewardRegistry([{kind:"vip",
      productId:"approved-live-explorer",tier:"explorer",
      rankTag:"ncbr:vip_explorer",duration:"30 dias",days:30}]);
    const prices=[{productId:"approved-live-explorer",
      productType:"vip" as const,priceCents:490}];
    let paid=false,posts=0;
    const provider:any={
      me:async()=>({id:42,netcraftTestAccount:false}),
      createPixOrder:async(request:any,id:string)=>{
        posts++;assert.equal(request.total_amount,"4.90");
        assert.equal(request.external_reference,id);
        return {id:ORD,external_reference:id,user_id:"42",type:"online",
          processing_mode:"automatic",total_amount:"4.90"};
      },
      get:async()=>{
        const result=ordersFixture(orderId,"4.90",paid?"approved":"pending");
        result.live_mode=true;
        result.transactions.payments[0].payment_method.qr_code="000201MOCK_ONLY";
        return result;
      },
    };
    const checkout=createNetCraftCommercialCheckout({
      db,provider,registry,approvedPrices:prices,releaseApproved:()=>true,now:()=>now});
    const first=await checkout.create({gamertag:"Halzin5212",
      email:"buyer@example.com",lines:[{productId:"approved-live-explorer",quantity:1}]},key);
    assert.ok("state" in first);
    if(!("state" in first))throw Error("checkout_missing");
    assert.equal(first.state,"pending");
    assert.equal(first.qrCode,"000201MOCK_ONLY");
    assert.equal(posts,1);
    const gateway=createNetCraftCommercialNickGateway({
      db,provider,registry,approvedPrices:prices,
      bdsOpaqueToken:token,privateHmacKey:hmac,
      webhookSecret:webhook,now:()=>now,
      authorizeOrderForDispatch:async(order:any)=>
        order.checkoutOrigin==="netcraft_commercial_checkout_v1",
    });
    // A pending payment never enters the queue, even if a buyer has its QR.
    const pending=await gateway.reconcileVerifiedOrder(orderId);
    assert.equal(pending.created,0);
    assert.equal(pending.state,"pending");
    assert.equal(pending.dispatchEnabled,false);
    paid=true;
    const requestId="mock-event-123";
    const ts=String(Math.floor(now/1000));
    const sig=crypto.createHmac("sha256",webhook)
      .update("id:"+ORD.toLowerCase()+";request-id:"+requestId+";ts:"+ts+";")
      .digest("hex");
    const checked=await gateway.reconcileSignedOrderNotification({
      orderId:ORD,requestId,type:"order",signature:"ts="+ts+",v1="+sig});
    assert.deepEqual(checked,{state:"approved",created:1,dispatchEnabled:true});
    assert.equal((await gateway.reconcileVerifiedOrder(orderId)).created,0);
    // The real service is only reachable via its private authenticated adapter.
    // Test in-process: use the service and signed opaque transport contract.
    const {createCommercialNickReleaseService}=await import(
      "../server/delivery/commercialNickReleaseService.ts");
    const {commercialPriceValidator}=await import(
      "../server/delivery/commercialCatalogReleaseApproval.ts");
    const service=createCommercialNickReleaseService(db,provider,{
      registry,validateOrder:commercialPriceValidator(prices,registry),
      authorizeOrderForDispatch:async(o:any)=>
        o.checkoutOrigin==="netcraft_commercial_checkout_v1",
      keyring:{netcraft_nick_private:hmac},now:()=>now,
    });
    const authentic=createOpaqueBdsNickReleaseAdapter({
      service,secret:token,hmacKey:hmac,now:()=>now});
    let nonce=0;
    const send=(action:"poll"|"ack",data:unknown)=>authentic({
      method:"POST",action,transportVerified:true,body:JSON.stringify(data),
      headers:{"x-nc-bds-token":token,
        "x-nc-timestamp":String(now),
        "x-nc-nonce":(++nonce).toString(16).padStart(32,"0")},
    });
    const offer=await send("poll",{gamertag:"Halzin5212",online:true}) as any;
    assert.equal(offer.dispatchEnabled,true);
    assert.equal(offer.deliveries.length,1);
    const job=offer.deliveries[0].payload;
    assert.equal(job.rankTag,"ncbr:vip_explorer");
    const grants:string[]=[],receipts=new Map<string,string>();
    const player={isValid:true,id:"local-mock-player",name:"Halzin5212"};
    const world={getAllPlayers:()=>[player],
      getDynamicProperty:(id:string)=>receipts.get(id),
      setDynamicProperty:(id:string,data:string)=>{receipts.set(id,data);}};
    const Server={VIPSystem:{vipRanks:new Map([["ncbr:vip_explorer",{}]]),
      getVIP:()=>null,
      grantDeliveryVIPLab:(_name:string,tag:string,days:number)=>{
        assert.equal(days,30);grants.push(tag);return "applied";}}};
    const executor=createVerifiedLabExecutor({world,Server,ItemStack:class {},
      isOfflineClone:()=>true,verifyLinkedPlayer:(p:any,j:any)=>
        p.id===player.id&&p.name===j.gamertag});
    assert.equal(executor.execute(job).status,"applied");
    assert.equal(executor.execute(job).status,"already_applied");
    assert.deepEqual(grants,["ncbr:vip_explorer"]);
    const done=await send("ack",{deliveryId:job.id,
      leaseToken:offer.deliveries[0].leaseToken,result:"applied"}) as any;
    assert.equal(done.status,"acknowledged");
    const after=await send("poll",{gamertag:"Halzin5212",online:true}) as any;
    assert.equal(after.deliveries.length,0);
    assert.equal(db.records.get("pixCommercialDeliveries/"+job.id).state,"acknowledged");
  } finally {
    for(const k of envs){
      if(before[k]===undefined)delete process.env[k];
      else process.env[k]=before[k];
    }
  }
});
