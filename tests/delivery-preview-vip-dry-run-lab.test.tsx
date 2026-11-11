import test from "node:test";
import assert from "node:assert/strict";
import {memoryDB} from "./fixtures/pixOrders.ts";
import {createPreviewGameLinkLab}
  from "../server/delivery/previewGameLinkLab.ts";
import {createPreviewVipDryRunLab}
  from "../server/delivery/previewVipDryRunLab.ts";
import {NETCRAFT_VIP_TERMS}
  from "../server/delivery/netcraftVipCatalogApproval.ts";
import {NETCRAFT_PREVIEW_VIP_APPROVALS}
  from "../server/delivery/netcraftVipPreviewApproval.ts";

const TOKEN="R".repeat(64),PLAYER="Halzin5212",START=Date.parse("2026-11-08T11:00:00.000Z");
const DURATION=30*24*60*60*1000;
const TIERS=["explorer","elite","supreme"] as const;
function setup(){
  const db=memoryDB();
  let t=START;
  const pair=createPreviewGameLinkLab({db:db as any,token:TOKEN,now:()=>t});
  const dry=createPreviewVipDryRunLab(db as any,{now:()=>t});
  return {db,pair,dry,now:()=>t,advance:(ms:number)=>{t+=ms;}};
}
async function linked(f:ReturnType<typeof setup>,player=PLAYER){
  const voucher=await f.pair.issue(player);
  const ch=await f.pair.challenge({schema:1},TOKEN);
  const verified=await f.pair.link({
    code:voucher.code,gamertag:player,sessionId:"bedrock-live-player-id",
  },{token:TOKEN,nonce:ch.nonce,timestamp:ch.timestamp});
  assert.equal(verified.status,"verified_in_game");
  assert.equal(verified.grantsEnabled,false);
  return voucher.receiptId;
}
test("Explorer, Elite and Supreme preview dry runs calculate exactly 30 days, never real VIP",async()=>{
  for(const tier of TIERS){
    const f=setup(),receiptId=await linked(f);
    const outcome=await f.dry.simulate({receiptId,tier});
    const expected=NETCRAFT_VIP_TERMS[tier];
    assert.equal(outcome.status,"simulated_only");
    assert.equal(outcome.receiptId,receiptId);
    assert.equal(outcome.gamertag,PLAYER);
    assert.equal(outcome.tier,tier);
    assert.equal(outcome.productId,
      NETCRAFT_PREVIEW_VIP_APPROVALS.find(x=>x.tier===tier)!.productId);
    assert.equal(outcome.rankTag,expected.rankTag);
    assert.equal(outcome.days,30);
    assert.equal(outcome.startsAt,START);
    assert.equal(outcome.endsAt-START,DURATION);
    assert.equal(outcome.simulation,true);
    assert.equal(outcome.grantsEnabled,false);
    assert.equal(outcome.dispatchEnabled,false);
    assert.equal(outcome.paymentsEnabled,false);
    assert.equal(outcome.liveVipGranted,false);
    assert.equal((await f.dry.inspect(receiptId)).status,"already_simulated");
    const record=JSON.stringify([...f.db.records]);
    assert.ok(!record.includes(voucherCodeMarker));
    assert.equal(record.includes(TOKEN),false);
    for(const name of f.db.records.keys()){
      assert.ok(name.startsWith("previewDeliveryLinkLabV1")||
        name.startsWith("previewDeliveryVipDryRunV1"),name);
      assert.equal(name.startsWith("pixCommercial"),false);
      assert.equal(name.startsWith("vip"),false);
    }
  }
});
const voucherCodeMarker="NC-THIS-IS-NOT-A-REAL-CODE";
test("duplicate clicks are idempotent and a tier switch cannot stack another entitlement",async()=>{
  const f=setup(),receiptId=await linked(f);
  const first=await f.dry.simulate({receiptId,tier:"explorer"});
  const before=f.db.records.size;
  f.advance(1000);
  const second=await f.dry.simulate({receiptId,tier:"explorer"});
  assert.equal(second.status,"already_simulated");
  assert.equal(second.startsAt,first.startsAt);
  assert.equal(second.endsAt,first.endsAt);
  assert.equal(f.db.records.size,before);
  await assert.rejects(()=>f.dry.simulate({receiptId,tier:"supreme"}),
    /simulation_already_exists/);
  assert.equal(f.db.records.size,before);
});
test("unverified, expired, ancient and corrupted session proof fail closed",async()=>{
  const f=setup();
  const voucher=await f.pair.issue(PLAYER);
  await assert.rejects(()=>f.dry.simulate({
    receiptId:voucher.receiptId,tier:"elite",
  }),/game_session_proof_missing_or_expired/);
  const linkedId=await linked(f,"OtherTester");
  f.advance(15*60*1000);
  await assert.rejects(()=>f.dry.simulate({
    receiptId:linkedId,tier:"elite",
  }),/game_session_proof_missing_or_expired/);
  const inspection=await f.dry.inspect(linkedId);
  assert.equal(inspection.status,"not_simulated");
  const f2=setup(),id=await linked(f2);
  const key="previewDeliveryLinkLabV1Receipts/"+id;
  const original=f2.db.records.get(key);
  for(const patch of [
    {sessionDigest:"wrong"},
    {proofExpiresAt:original.verifiedAt+24*60*60*1000},
    {state:"issued"},
    {gamertag:" bad "},
    {verifiedAt:-1},
  ]){
    f2.db.records.set(key,{...original,...patch});
    await assert.rejects(()=>f2.dry.simulate({
      receiptId:id,tier:"supreme",
    }),/game_session_proof_missing_or_expired/);
  }
  // The installed Core may still use a prior Preview URL which stored
  // verifiedAt but not proofExpiresAt. The deadline must remain 15 minutes.
  const legacy={...original};
  delete (legacy as any).proofExpiresAt;
  f2.db.records.set(key,legacy);
  assert.equal((await f2.dry.simulate({receiptId:id,tier:"elite"})).tier,"elite");
  const f3=setup(),thirdId=await linked(f3);
  const thirdKey="previewDeliveryLinkLabV1Receipts/"+thirdId;
  const old=f3.db.records.get(thirdKey);
  const oldLegacy={...old};
  delete (oldLegacy as any).proofExpiresAt;
  f3.db.records.set(thirdKey,oldLegacy);
  f3.advance(15*60*1000);
  await assert.rejects(()=>f3.dry.simulate({
    receiptId:thirdId,tier:"explorer",
  }),/game_session_proof_missing_or_expired/);
});
test("forged client fields, unknown tier or malformed receipt can never pick rank, duration or nickname",async()=>{
  const f=setup(),id=await linked(f);
  const attacks=[
    {receiptId:id,tier:"supreme",gamertag:"AnotherPlayer"},
    {receiptId:id,tier:"explorer",days:365},
    {receiptId:id,tier:"explorer",rankTag:"ncbr:vip_supreme"},
    {receiptId:id,tier:"admin"},
    {receiptId:"x",tier:"elite"},
    {tier:"explorer"},
  ];
  for(const attack of attacks)
    await assert.rejects(()=>f.dry.simulate(attack as any),
      /invalid_simulation_request/);
  assert.equal((await f.dry.inspect(id)).status,"not_simulated");
});
test("code reuse, username mismatch and expired voucher are rejected before a VIP simulation",async()=>{
  const f=setup(),voucher=await f.pair.issue(PLAYER);
  const bad=await f.pair.challenge({schema:1},TOKEN);
  await assert.rejects(()=>f.pair.link({
    code:voucher.code,gamertag:"DifferentUser",sessionId:"other-session",
  },{token:TOKEN,nonce:bad.nonce,timestamp:bad.timestamp}),
  /invalid_or_expired_lab_code/);
  await assert.rejects(()=>f.dry.simulate({
    receiptId:voucher.receiptId,tier:"supreme",
  }),/game_session_proof_missing_or_expired/);
  const good=await f.pair.challenge({schema:1},TOKEN);
  await f.pair.link({code:voucher.code,gamertag:PLAYER,
    sessionId:"live-player-id"},{
    token:TOKEN,nonce:good.nonce,timestamp:good.timestamp,
  });
  const repeated=await f.pair.challenge({schema:1},TOKEN);
  await assert.rejects(()=>f.pair.link({
    code:voucher.code,gamertag:PLAYER,sessionId:"live-player-id",
  },{token:TOKEN,nonce:repeated.nonce,timestamp:repeated.timestamp}),
  /invalid_or_expired_lab_code/);
  const f2=setup(),v=await f2.pair.issue(PLAYER);
  f2.advance(600001);
  const fresh=await f2.pair.challenge({schema:1},TOKEN);
  await assert.rejects(()=>f2.pair.link({
    code:v.code,gamertag:PLAYER,sessionId:"live-player-id",
  },{token:TOKEN,nonce:fresh.nonce,timestamp:fresh.timestamp}),
  /invalid_or_expired_lab_code/);
  await assert.rejects(()=>f2.dry.simulate({
    receiptId:v.receiptId,tier:"explorer",
  }),/game_session_proof_missing_or_expired/);
});
