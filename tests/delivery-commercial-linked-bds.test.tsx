// In-memory Firestore-style model, synthetic Mercado Pago only.
// Demonstrates checkoutKey -> one-time BDS proof -> isolated queue -> session ACK.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {memoryDB,ordersFixture,ORD} from "./fixtures/pixOrders.ts";
import {createCommercialGamePairing} from "../server/delivery/commercialGamePairing.ts";
import {createCommercialNickReleaseService} from "../server/delivery/commercialNickReleaseService.ts";
import {makeRewardRegistry} from "../server/delivery/verifiedRewardRegistry.ts";
import {commercialPriceValidator} from "../server/delivery/commercialCatalogReleaseApproval.ts";
import {createOpaqueBdsNickReleaseAdapter,issuePersistedPrivateBdsChallenge}
  from "../server/delivery/bdsOpaqueNickReleaseAdapter.ts";
const NOW=Date.parse("2026-11-07T12:00:00.000Z");
const KEY="linked-buyer-012345678901234567890",GAMERTAG="Halzin5212";
const ID=crypto.createHash("sha256").update("netcraft-commercial-v1:"+KEY).digest("hex");
const TOKEN="T".repeat(64),HMAC="H".repeat(64);
const envs=["NODE_ENV","VERCEL_ENV","FIRESTORE_EMULATOR_HOST",
  "NETCRAFT_DELIVERY_RELEASE_APPROVED","NCBR_COMMERCIAL_MP_ACCESS_TOKEN",
  "NCBR_COMMERCIAL_FIREBASE_SERVICE_ACCOUNT_JSON"];
async function withMockProduction(run:()=>Promise<void>){
  const original=Object.fromEntries(envs.map(k=>[k,process.env[k]]));
  try {
    process.env.NODE_ENV="production";
    process.env.VERCEL_ENV="production";
    delete process.env.FIRESTORE_EMULATOR_HOST;
    process.env.NETCRAFT_DELIVERY_RELEASE_APPROVED="PRIVATE_GATEWAY_REVIEWED";
    process.env.NCBR_COMMERCIAL_MP_ACCESS_TOKEN="OFFLINE_MOCK_ONLY";
    process.env.NCBR_COMMERCIAL_FIREBASE_SERVICE_ACCOUNT_JSON="OFFLINE_MOCK_ONLY";
    await run();
  }finally{
    for(const k of envs)original[k]===undefined?
      delete process.env[k]:process.env[k]=original[k];
  }
}
async function fixture(){
  const db=memoryDB() as any;
  let paid=false;
  db.records.set("pixCommercialOrders/"+ID,{
    id:ID,environment:"commercial",catalogValidated:true,
    checkoutOrigin:"netcraft_commercial_checkout_v1",
    requestHash:"c".repeat(64),providerOrderId:ORD,collector:"42",
    totalCents:490,currency:"BRL",gamertag:GAMERTAG,state:"pending",
    lines:[{productType:"vip",productId:"approved-explorer",quantity:1,duration:"30 dias"}],
  });
  const registry=makeRewardRegistry([{
    kind:"vip",productId:"approved-explorer",tier:"explorer",
    rankTag:"ncbr:vip_explorer",duration:"30 dias",days:30,
  }]);
  const prices=[{productId:"approved-explorer",
    productType:"vip" as const,priceCents:490}];
  const pairing=createCommercialGamePairing(db,{
    hashSecret:"mock-blind-key-012345678901234567890-secret",now:()=>NOW,
  });
  const service=createCommercialNickReleaseService(db,{
    me:async()=>({id:"42",netcraftTestAccount:false}),
    get:async()=>({...ordersFixture(ID,"4.90",paid?"approved":"pending"),live_mode:true}),
  },{
    registry,validateOrder:commercialPriceValidator(prices,registry),
    authorizeOrderForDispatch:async(order,sessionId)=>
      typeof sessionId==="string" && pairing.verifyActiveSession({
        orderId:order.id,gamertag:order.gamertag,sessionId,
      }),
    claimGameLink:proof=>pairing.claimInGame(proof,()=>true),
    requireIssuedChallenge:true,
    keyring:{netcraft_nick_private:HMAC},now:()=>NOW,
  });
  const adapter=createOpaqueBdsNickReleaseAdapter({
    service,secret:TOKEN,hmacKey:HMAC,now:()=>NOW,
  });
  async function bds(action:"link"|"poll"|"ack",body:unknown,token=TOKEN){
    const challenge=await issuePersistedPrivateBdsChallenge({
      method:"POST",transportVerified:true,body:'{"schema":1}',
      receivedToken:TOKEN,secret:TOKEN,db,now:()=>NOW,
    });
    return adapter({method:"POST",transportVerified:true,action,
      body:JSON.stringify(body),
      headers:{"x-nc-bds-token":token,
        "x-nc-nonce":challenge.nonce,"x-nc-timestamp":challenge.timestamp},
    });
  }
  return {db,pairing,service,bds,setPaid:()=>{paid=true;}};
}
test("commercial BDS link/offer/ACK requires exact authenticated session; no real grant",async()=>{
  await withMockProduction(async()=>{
    const f=await fixture(),code=await f.pairing.issueForCheckoutKey(KEY);
    assert.equal((await f.service.reconcileAndQueue(ID)).created,0);
    await assert.rejects(()=>f.bds("link",{
      code:code.code,gamertag:"WrongRecipient",sessionId:"bedrock-player-1",
    }),/invalid_or_expired_code/);
    await assert.rejects(()=>f.bds("link",{
      code:code.code,gamertag:GAMERTAG,sessionId:"bedrock-player-1",
    },"F".repeat(64)),/unauthorized_bds_request/);
    assert.deepEqual(await f.bds("link",{
      code:code.code,gamertag:GAMERTAG,sessionId:"bedrock-player-1",
    }),{status:"verified_in_game",gamertag:GAMERTAG,orderId:ID});
    await assert.rejects(()=>f.bds("link",{
      code:code.code,gamertag:GAMERTAG,sessionId:"bedrock-player-1",
    }),/invalid_or_expired_code/);
    f.setPaid();
    assert.equal((await f.service.reconcileAndQueue(ID)).created,1);
    const wrong=await f.bds("poll",{gamertag:GAMERTAG,online:true,
      sessionId:"different-player"}) as any;
    assert.equal(wrong.deliveries.length,0);
    const noSession=await f.bds("poll",{gamertag:GAMERTAG,online:true}) as any;
    assert.equal(noSession.deliveries.length,0);
    const legit=await f.bds("poll",{gamertag:GAMERTAG,online:true,
      sessionId:"bedrock-player-1"}) as any;
    assert.equal(legit.deliveries.length,1);
    const offer=legit.deliveries[0];
    assert.equal(offer.payload.kind,"vip");
    assert.equal(offer.payload.rankTag,"ncbr:vip_explorer");
    assert.equal(offer.payload.days,30);
    assert.equal((await f.bds("ack",{deliveryId:ID+"-0",
      leaseToken:offer.leaseToken,result:"applied",sessionId:"different-player"}) as any).status,"held");
    assert.equal((await f.bds("ack",{deliveryId:ID+"-0",
      leaseToken:offer.leaseToken,result:"applied",sessionId:"bedrock-player-1"}) as any).status,"acknowledged");
    assert.equal(f.db.records.get("pixCommercialDeliveries/"+ID+"-0").state,"acknowledged");
    assert.equal((await f.bds("poll",{gamertag:GAMERTAG,online:true,
      sessionId:"bedrock-player-1"}) as any).deliveries.length,0);
  });
});
test("cancelled payment cannot offer a VIP even after successful in-game link",async()=>{
  await withMockProduction(async()=>{
    const f=await fixture(),code=await f.pairing.issueForCheckoutKey(KEY);
    await f.bds("link",{code:code.code,gamertag:GAMERTAG,sessionId:"a"});
    assert.equal((await f.service.reconcileAndQueue(ID)).state,"pending");
    const p=await f.bds("poll",{gamertag:GAMERTAG,online:true,sessionId:"a"}) as any;
    assert.equal(p.deliveries.length,0);
  });
});
