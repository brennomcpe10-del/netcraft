/**
 * Entire prospective commercial path, using ONLY in-memory Firestore and
 * synthetic Mercado Pago HTTP responses. No network, charge, BDS grant or
 * Production environment variable is changed outside this test process.
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {memoryDB,ordersFixture,ORD} from "./fixtures/pixOrders.ts";
import {makeRewardRegistry} from "../server/delivery/verifiedRewardRegistry.ts";
import {commercialPriceValidator} from "../server/delivery/commercialCatalogReleaseApproval.ts";
import {createCommercialOrdersWriter} from "../server/payments/mercadoPagoCommercialWriter.ts";
import {createNetCraftCommercialCheckout} from "../server/delivery/commercialCheckoutService.ts";
import {createNetCraftCommercialNickGateway} from "../server/delivery/commercialNickGateway.ts";
import {createCommercialGamePairing} from "../server/delivery/commercialGamePairing.ts";
import {issueCodeAfterCommercialPaymentRefresh,refreshCommercialBuyerOrder}
  from "../server/delivery/commercialBuyerRefresh.ts";
import {createCommercialNickReleaseService}
  from "../server/delivery/commercialNickReleaseService.ts";
import {createOpaqueBdsNickReleaseAdapter,issuePersistedPrivateBdsChallenge}
  from "../server/delivery/bdsOpaqueNickReleaseAdapter.ts";

const TIME=Date.parse("2026-11-17T16:00:00.000Z");
const KEY="commercial-realistic-mock-123456789";
const GAMERTAG="Ryck432",SESSION="bedrock-session-realistic-mock-1";
const PRODUCT="netcraft-explorer-fixture";
const ID=crypto.createHash("sha256").update("netcraft-commercial-v1:"+KEY).digest("hex");
const TOKEN="T".repeat(64),HMAC="H".repeat(64),WEBHOOK="W".repeat(64);
const registry=makeRewardRegistry([{
  kind:"vip",productId:PRODUCT,tier:"explorer",rankTag:"ncbr:vip_explorer",
  duration:"30 dias",days:30,
}]);
const prices=[{productId:PRODUCT,productType:"vip" as const,priceCents:490}];
const names=["NODE_ENV","VERCEL_ENV","FIRESTORE_EMULATOR_HOST",
  "NETCRAFT_DELIVERY_RELEASE_APPROVED","NCBR_COMMERCIAL_MP_ACCESS_TOKEN",
  "NCBR_COMMERCIAL_FIREBASE_SERVICE_ACCOUNT_JSON"];
async function mockOnly(run:()=>Promise<void>){
  const old=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  try{
    process.env.NODE_ENV="production";
    process.env.VERCEL_ENV="production";
    delete process.env.FIRESTORE_EMULATOR_HOST;
    process.env.NETCRAFT_DELIVERY_RELEASE_APPROVED="PRIVATE_GATEWAY_REVIEWED";
    process.env.NCBR_COMMERCIAL_MP_ACCESS_TOKEN="OFFLINE_MOCK_NO_CHARGES";
    process.env.NCBR_COMMERCIAL_FIREBASE_SERVICE_ACCOUNT_JSON="OFFLINE_MOCK_NO_DB";
    await run();
  }finally{
    for(const name of names){
      if(old[name]===undefined)delete process.env[name];
      else process.env[name]=old[name];
    }
  }
}
function fixture(){
  const db=memoryDB() as any;
  let state="pending",postCount=0,grantCount=0;
  let enabled=true;
  const transport:typeof fetch=async(url,init)=>{
    const path=String(url),method=init?.method??"GET";
    if(method==="GET"&&path.endsWith("/users/me"))
      return new Response(JSON.stringify({id:"42",tags:[]}),{status:200});
    if(method==="POST"&&path.endsWith("/v1/orders")){
      postCount++;
      const data=JSON.parse(String(init?.body));
      assert.equal(data.external_reference,ID);
      assert.equal(data.total_amount,"4.90");
      assert.equal(data.transactions.payments[0].payment_method.id,"pix");
      assert.equal(new Headers(init?.headers).get("x-idempotency-key"),ID);
      return new Response(JSON.stringify({id:ORD,user_id:"42",type:"online",
        processing_mode:"automatic",external_reference:ID,total_amount:"4.90"}),
        {status:201});
    }
    if(method==="GET"&&path.endsWith("/v1/orders/"+ORD)){
      const result=ordersFixture(ID,"4.90",state);
      result.live_mode=true;
      result.transactions.payments[0].payment_method.qr_code="FAKE_PIX_NOT_PAYABLE";
      return new Response(JSON.stringify(result),{status:200});
    }
    throw Error("Unexpected external request from offline integration fixture");
  };
  const provider=createCommercialOrdersWriter({
    accessToken:"APP_USR-"+("T".repeat(48)),
    transport,checkoutAuthorized:()=>enabled,
  });
  const pairing=createCommercialGamePairing(db,{
    hashSecret:"commercial-fixture-pairing-secret-"+("S".repeat(48)),
    now:()=>TIME,
  });
  const checkout=createNetCraftCommercialCheckout({
    db,provider,registry,approvedPrices:prices,releaseApproved:()=>enabled,
    now:()=>TIME,
  });
  const authorize=async(order:any,sessionId?:string)=>
    enabled&&typeof sessionId==="string"&&
    (await pairing.verifyActiveSession({
      orderId:order.id,gamertag:order.gamertag,sessionId,
    }));
  const delivery=createNetCraftCommercialNickGateway({
    db,provider,registry,approvedPrices:prices,bdsOpaqueToken:TOKEN,
    privateHmacKey:HMAC,webhookSecret:WEBHOOK,
    authorizeOrderForDispatch:authorize,
    claimGameLink:proof=>pairing.claimInGame(proof,()=>true),
    now:()=>TIME,
  });
  const nickService=createCommercialNickReleaseService(db,provider,{
    registry,validateOrder:commercialPriceValidator(prices,registry),
    authorizeOrderForDispatch:authorize,
    claimGameLink:proof=>pairing.claimInGame(proof,()=>true),
    keyring:{netcraft_nick_private:HMAC},requireIssuedChallenge:true,
    now:()=>TIME,
  });
  const adapter=createOpaqueBdsNickReleaseAdapter({
    service:nickService,secret:TOKEN,hmacKey:HMAC,now:()=>TIME,
  });
  async function bds(action:"poll"|"ack"|"link",body:unknown){
    const challenge=await issuePersistedPrivateBdsChallenge({
      method:"POST",transportVerified:true,body:'{"schema":1}',
      receivedToken:TOKEN,secret:TOKEN,db,now:()=>TIME,
    });
    return adapter({method:"POST",action,transportVerified:true,
      body:JSON.stringify(body),
      headers:{"x-nc-bds-token":TOKEN,"x-nc-nonce":challenge.nonce,
        "x-nc-timestamp":challenge.timestamp},
    }) as Promise<any>;
  }
  return {db,checkout,delivery,pairing,bds,
    posts:()=>postCount,grants:()=>grantCount,
    grantOnce:(job:any)=>{
      const ref="minecraftCoreReceipts/"+job.id;
      if(db.records.has(ref))return "already_applied";
      db.records.set(ref,{state:"applied",gamertag:job.gamertag});
      grantCount++;
      return "applied";
    },
    setState:(next:string)=>{state=next;},
    stop:()=>{enabled=false;},
  };
}

test("offline full journey: POST Pix -> GET accredited -> one code -> BDS link -> offer -> Core receipt -> ACK",async()=>{
  await mockOnly(async()=>{
    const f=fixture();
    const order=await f.checkout.create({
      gamertag:GAMERTAG,email:"buyer@example.com",
      lines:[{productId:PRODUCT,quantity:1}],
    },KEY) as any;
    assert.equal(order.id,ID);
    assert.equal(order.state,"pending");
    assert.equal(order.totalCents,490);
    assert.equal(order.qrCode,"FAKE_PIX_NOT_PAYABLE");
    assert.equal(f.posts(),1);
    assert.equal((await f.checkout.create({
      gamertag:GAMERTAG,email:"buyer@example.com",
      lines:[{productId:PRODUCT,quantity:1}],
    },KEY) as any).state,"pending");
    assert.equal(f.posts(),1);
    await assert.rejects(()=>issueCodeAfterCommercialPaymentRefresh({
      checkout:f.checkout,delivery:f.delivery,pairing:f.pairing,
    },KEY,ID),/commercial_payment_not_verified_for_link/);
    assert.equal((await f.delivery.reconcileVerifiedOrder(ID)).created,0);
    f.setState("approved");
    // Webhook is only a notification: the gateway verifies the signature,
    // then fetches the authoritative Orders resource before queueing.
    const requestId="mercadopago-mock-order-approved";
    const ts=String(Math.floor(TIME/1000));
    const signature="ts="+ts+",v1="+crypto.createHmac("sha256",WEBHOOK)
      .update("id:"+ORD.toLowerCase()+";request-id:"+requestId+";ts:"+ts+";")
      .digest("hex");
    const notification={orderId:ORD,requestId,signature,type:"order"};
    await assert.rejects(()=>f.delivery.reconcileSignedOrderNotification({
      ...notification,signature:"ts="+ts+",v1="+("0".repeat(64)),
    }),/unverified_commercial_notification/);
    assert.equal((await f.delivery.reconcileSignedOrderNotification(notification)).created,1);
    assert.equal((await f.delivery.reconcileSignedOrderNotification(notification)).created,0);
    const before=await refreshCommercialBuyerOrder({
      checkout:f.checkout,delivery:f.delivery,
    },KEY,ID) as any;
    assert.equal(before.state,"approved");
    assert.equal(before.deliveryStatus,"queued");
    assert.equal((await f.delivery.reconcileVerifiedOrder(ID)).created,0);
    const proof=await issueCodeAfterCommercialPaymentRefresh({
      checkout:f.checkout,delivery:f.delivery,pairing:f.pairing,
    },KEY,ID);
    assert.match(proof.code,/^NC-[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/);
    await assert.rejects(()=>f.pairing.issueForCheckoutKey(KEY),/code_still_active/);
    const wrong=await f.bds("poll",{gamertag:GAMERTAG,online:true,sessionId:SESSION});
    assert.deepEqual(wrong.deliveries,[]);
    const linked=await f.bds("link",{
      code:proof.code,gamertag:GAMERTAG,sessionId:SESSION,
    });
    assert.equal(linked.status,"verified_in_game");
    assert.equal(linked.orderId,ID);
    await assert.rejects(()=>f.bds("link",{
      code:proof.code,gamertag:GAMERTAG,sessionId:SESSION,
    }),/invalid_or_expired_code/);
    const other=await f.bds("poll",{
      gamertag:GAMERTAG,online:true,sessionId:"different-bedrock-session",
    });
    assert.equal(other.deliveries.length,0);
    const allowed=await f.bds("poll",{gamertag:GAMERTAG,online:true,sessionId:SESSION});
    assert.equal(allowed.deliveries.length,1);
    const offer=allowed.deliveries[0];
    assert.equal(offer.deliveryId,ID+"-0");
    assert.equal(offer.payload.rankTag,"ncbr:vip_explorer");
    assert.equal(offer.payload.days,30);
    const outcome=f.grantOnce(offer.payload);
    assert.equal(outcome,"applied");
    const response=await f.bds("ack",{deliveryId:offer.deliveryId,
      leaseToken:offer.leaseToken,result:outcome,sessionId:SESSION});
    assert.equal(response.status,"acknowledged");
    assert.equal(response.duplicate,false);
    assert.equal(f.grantOnce(offer.payload),"already_applied");
    assert.equal(f.grants(),1);
    const duplicate=await f.bds("ack",{deliveryId:offer.deliveryId,
      leaseToken:offer.leaseToken,result:"already_applied",sessionId:SESSION});
    assert.equal(duplicate.status,"acknowledged");
    assert.equal(duplicate.duplicate,true);
    assert.equal((await f.bds("poll",{
      gamertag:GAMERTAG,online:true,sessionId:SESSION,
    })).deliveries.length,0);
    assert.equal((await f.checkout.viewByCheckoutKey(KEY) as any).deliveryStatus,"delivered");
  });
});

test("offline full journey: refund after ACK requires review; no replacement voucher or offer",async()=>{
  await mockOnly(async()=>{
    const f=fixture();
    await f.checkout.create({gamertag:GAMERTAG,email:"buyer@example.com",
      lines:[{productId:PRODUCT,quantity:1}]},KEY);
    f.setState("approved");
    await f.delivery.reconcileVerifiedOrder(ID);
    const proof=await issueCodeAfterCommercialPaymentRefresh({
      checkout:f.checkout,delivery:f.delivery,pairing:f.pairing,
    },KEY,ID);
    await f.bds("link",{code:proof.code,gamertag:GAMERTAG,sessionId:SESSION});
    const leased=await f.bds("poll",{gamertag:GAMERTAG,online:true,sessionId:SESSION});
    const offer=leased.deliveries[0];
    assert.equal(f.grantOnce(offer.payload),"applied");
    assert.equal((await f.bds("ack",{deliveryId:offer.deliveryId,
      leaseToken:offer.leaseToken,result:"applied",sessionId:SESSION})).status,"acknowledged");
    f.setState("refunded");
    assert.equal((await f.delivery.reconcileVerifiedOrder(ID)).state,"refunded");
    assert.equal(f.db.records.get("pixCommercialDeliveries/"+offer.deliveryId).state,"refunded_after_ack");
    await assert.rejects(()=>issueCodeAfterCommercialPaymentRefresh({
      checkout:f.checkout,delivery:f.delivery,pairing:f.pairing,
    },KEY,ID),/commercial_payment_not_verified_for_link/);
    assert.equal((await f.bds("poll",{
      gamertag:GAMERTAG,online:true,sessionId:SESSION,
    })).deliveries.length,0);
    assert.equal(f.grants(),1);
  });
});
