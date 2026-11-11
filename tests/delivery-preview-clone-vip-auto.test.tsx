import test from "node:test";
import assert from "node:assert/strict";
import {memoryDB} from "./fixtures/pixOrders.ts";
import {createPreviewGameLinkLab}
  from "../server/delivery/previewGameLinkLab.ts";
import {createPreviewCloneVipAutoLab}
  from "../server/delivery/previewCloneVipAutoLab.ts";
import {NETCRAFT_VIP_TERMS}
  from "../server/delivery/netcraftVipCatalogApproval.ts";

const TOKEN="Z".repeat(64),LINK_TOKEN="L".repeat(64),PLAYER="Halzin5212";
const START=Date.parse("2026-11-09T20:00:00Z");
function setup(){
  const db=memoryDB();
  let clock=START;
  const link=createPreviewGameLinkLab({
    db:db as any,token:LINK_TOKEN,now:()=>clock,
  });
  const svc=createPreviewCloneVipAutoLab({
    db:db as any,cloneToken:TOKEN,linkToken:LINK_TOKEN,now:()=>clock,
  });
  async function linked(){
    const code=await link.issue(PLAYER);
    const challenge=await link.challenge({schema:1},LINK_TOKEN);
    await link.link({code:code.code,gamertag:PLAYER,sessionId:"clone-player-session-1"},{
      token:LINK_TOKEN,nonce:challenge.nonce,timestamp:challenge.timestamp,
    });
    return code.receiptId;
  }
  async function authorized<T>(method:"poll"|"ack"|"nack",body:any):Promise<T>{
    const c=await svc.challenge({schema:1},TOKEN);
    await svc.authenticate(TOKEN,c.nonce,c.timestamp);
    return svc[method](body) as Promise<T>;
  }
  return {db,svc,linked,authorized,step:(ms:number)=>clock+=ms};
}
const request={gamertag:PLAYER,sessionId:"clone-player-session-1"};
const rules=["explorer","elite","supreme"] as const;
test("all three fictitious tiers map to an exact isolated 30-day offer; no commerce",async()=>{
  for(const tier of rules){
    const f=setup(),receiptId=await f.linked();
    const queued=await f.svc.queue({receiptId,tier});
    assert.equal(queued.state,"queued_clone");
    assert.equal(queued.rankTag,NETCRAFT_VIP_TERMS[tier].rankTag);
    assert.equal(queued.commercialDispatchEnabled,false);
    assert.equal(queued.paymentsEnabled,false);
    assert.equal(queued.cloneOnly,true);
    const {offer,simulation,cloneOnly,commercialDispatchEnabled}:any=
      await f.authorized("poll",request);
    assert.ok(offer);
    assert.equal(simulation,true);assert.equal(cloneOnly,true);
    assert.equal(commercialDispatchEnabled,false);
    assert.equal(offer.payload.kind,"vip");
    assert.equal(offer.payload.rankTag,"ncbr:vip_"+tier);
    assert.equal(offer.payload.days,30);
    assert.equal(offer.payload.gamertag,PLAYER);
    const again:any=await f.authorized("poll",request);
    assert.equal(again.offer,null);
    const ack=await f.authorized<any>("ack",{receiptId,
      leaseToken:offer.leaseToken,...request,result:"applied"});
    assert.equal(ack.status,"acknowledged_clone");
    const ackAgain=await f.authorized<any>("ack",{receiptId,
      leaseToken:offer.leaseToken,...request,result:"already_applied"});
    assert.equal(ackAgain.duplicate,true);
    assert.equal((await f.svc.status(receiptId)).state,"acknowledged_clone");
    for(const key of f.db.records.keys())
      assert.ok(key.startsWith("previewCloneVipAutoV1")||
        key.startsWith("previewDeliveryLinkLabV1"),key);
    const all=JSON.stringify([...f.db.records]);
    assert.ok(!all.includes(TOKEN));
    assert.ok(!all.includes(LINK_TOKEN));
  }
});
test("unverified, expired, malformed or reissued fake orders cannot queue",async()=>{
  const f=setup();
  const issued=await f.svc.status("b".repeat(64));
  assert.equal(issued.state,"not_queued");
  await assert.rejects(()=>f.svc.queue({receiptId:"b".repeat(64),
    tier:"elite"}),/clone_link_proof_expired/);
  const receiptId=await f.linked();
  await assert.rejects(()=>f.svc.queue({receiptId,tier:"supreme",
    days:365} as any),/invalid_clone_queue/);
  await assert.rejects(()=>f.svc.queue({receiptId,tier:"admin"} as any),
    /invalid_clone_queue/);
  f.step(900_000);
  await assert.rejects(()=>f.svc.queue({receiptId,tier:"elite"}),
    /clone_link_proof_expired/);
});
test("token, nonce and cross-session replay cannot grant or ACK",async()=>{
  const f=setup(),receiptId=await f.linked();
  await f.svc.queue({receiptId,tier:"supreme"});
  await assert.rejects(()=>f.svc.challenge({schema:1},"wrong"),
    /clone_bds_unauthorized/);
  const ch=await f.svc.challenge({schema:1},TOKEN);
  await assert.rejects(()=>f.svc.authenticate("other",ch.nonce,ch.timestamp),
    /clone_bds_unauthorized/);
  await f.svc.authenticate(TOKEN,ch.nonce,ch.timestamp);
  await assert.rejects(()=>f.svc.authenticate(TOKEN,ch.nonce,ch.timestamp),
    /clone_challenge_replayed/);
  const notPlayer:any=await f.authorized("poll",{
    gamertag:"WrongPerson",sessionId:request.sessionId});
  assert.equal(notPlayer.offer,null);
  const otherSession:any=await f.authorized("poll",{
    gamertag:PLAYER,sessionId:"different-clone-session",
  });
  assert.equal(otherSession.offer,null);
  const real:any=await f.authorized("poll",request);
  assert.ok(real.offer);
  await assert.rejects(()=>f.authorized("ack",{
    receiptId,leaseToken:real.offer.leaseToken,gamertag:PLAYER,
    sessionId:"another-session",result:"applied",
  }),/clone_lease_mismatch/);
  await assert.rejects(()=>f.authorized("ack",{
    receiptId,leaseToken:"0".repeat(32),...request,result:"applied",
  }),/clone_lease_mismatch/);
  assert.equal((await f.svc.status(receiptId)).state,"offered_clone");
});
test("lost ACK or clone failure quarantines delivery, never automatically redispatches",async()=>{
  const f=setup(),receiptId=await f.linked();
  await f.svc.queue({receiptId,tier:"explorer"});
  const offer:any=(await f.authorized<any>("poll",request)).offer;
  f.step(91_000);
  const retry:any=await f.authorized("poll",request);
  assert.equal(retry.offer,null);
  assert.equal((await f.svc.status(receiptId)).state,"manual_review");
  // After a real Core writes the applied receipt, authenticated late ACK
  // is still allowed with the ORIGINAL lease. No second offer was created.
  const acknowledged=await f.authorized<any>("ack",{
    receiptId,leaseToken:offer.leaseToken,...request,result:"applied",
  });
  assert.equal(acknowledged.status,"acknowledged_clone");
  assert.equal((await f.svc.status(receiptId)).state,"acknowledged_clone");
  const f2=setup(),id2=await f2.linked();
  await f2.svc.queue({receiptId:id2,tier:"elite"});
  const offer2:any=(await f2.authorized<any>("poll",request)).offer;
  const nack=await f2.authorized<any>("nack",{
    receiptId:id2,leaseToken:offer2.leaseToken,...request,
    result:"manual_review",
  });
  assert.equal(nack.status,"manual_review");
  assert.equal((await f2.authorized<any>("poll",request)).offer,null);
});
