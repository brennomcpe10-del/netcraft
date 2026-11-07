// No network, no BDS instance, no provider, no live grants.
// Exercises Firestore-style transactional voucher ownership and session proof.
import {test} from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {memoryDB} from "./fixtures/pixOrders.ts";
import {createCommercialGamePairing,CommercialGamePairingBlocked}
  from "../server/delivery/commercialGamePairing.ts";

const KEY="test-checkout-012345678901234567890", NAME="Halzin5212";
const ID=crypto.createHash("sha256").update("netcraft-commercial-v1:"+KEY).digest("hex");
const START=Date.parse("2026-11-07T12:00:00.000Z");
function fixture(){
  let now=START;
  const db=memoryDB();
  const order={
    id:ID,environment:"commercial",checkoutOrigin:"netcraft_commercial_checkout_v1",
    catalogValidated:true,requestHash:"a".repeat(64),
    gamertag:NAME,state:"pending",totalCents:490,
    lines:[{productType:"vip",productId:"approved-explorer",
      quantity:1,duration:"30 dias"}],
  };
  db.records.set("pixCommercialOrders/"+ID,order);
  const link=createCommercialGamePairing(db as any,{
    hashSecret:"unit-test-private-blind-token-key-with-more-than-32-bytes",
    now:()=>now,
  });
  const clock=(ms:number)=>{now+=ms;};
  return {db,link,clock,order};
}
test("link code belongs only to a persisted server checkout, with no plaintext in Firestore",async()=>{
  const f=fixture(),issued=await f.link.issueForCheckoutKey(KEY);
  assert.match(issued.code,/^NC-[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/);
  assert.equal(issued.orderId,ID);
  assert.equal(issued.expiresAt-START,600000);
  assert.equal(f.db.records.has("pixCommercialPlayerLinkSlots/"+ID),true);
  const records=JSON.stringify([...f.db.records.entries()]);
  assert.equal(records.includes(issued.code),false);
  assert.equal(records.includes("unit-test-private-blind-token"),false);
  await assert.rejects(()=>f.link.issueForCheckoutKey(KEY),
    (e:any)=>e instanceof CommercialGamePairingBlocked&&e.reason==="code_still_active");
  await assert.rejects(()=>f.link.issueForCheckoutKey("wrong-checkout-012345678901234"),
    /order_not_eligible/);
});
test("only an authenticated in-game matching-name session may consume voucher once",async()=>{
  const f=fixture(),{code}=await f.link.issueForCheckoutKey(KEY);
  const proof={code,gamertag:NAME,sessionId:"bedrock-session-player-884"};
  await assert.rejects(()=>f.link.claimInGame(proof,()=>false),
    /unverified_game_principal/);
  await assert.rejects(()=>f.link.claimInGame({...proof,gamertag:"OtherPlayer"},()=>true),
    /invalid_or_expired_code/);
  assert.equal(await f.link.verifyActiveSession({orderId:ID,gamertag:NAME,
    sessionId:proof.sessionId}),false);
  const result=await f.link.claimInGame(proof,()=>true);
  assert.deepEqual(result,{status:"verified_in_game",gamertag:NAME,orderId:ID});
  assert.equal(await f.link.verifyActiveSession({orderId:ID,gamertag:NAME,
    sessionId:proof.sessionId}),true);
  assert.equal(await f.link.verifyActiveSession({orderId:ID,gamertag:NAME,
    sessionId:"another-session"}),false);
  assert.equal(await f.link.verifyActiveSession({orderId:ID,gamertag:"OtherPlayer",
    sessionId:proof.sessionId}),false);
  await assert.rejects(()=>f.link.claimInGame(proof,()=>true),
    /invalid_or_expired_code/);
  await assert.rejects(()=>f.link.issueForCheckoutKey(KEY),/already_linked/);
});
test("stale session cannot grant after proof TTL or BDS reconnect",async()=>{
  const f=fixture(),{code}=await f.link.issueForCheckoutKey(KEY);
  await f.link.claimInGame({code,gamertag:NAME,sessionId:"session-A"},()=>true);
  f.clock(15*60*1000);
  assert.equal(await f.link.verifyActiveSession({orderId:ID,gamertag:NAME,
    sessionId:"session-A"}),false);
  const fresh=await f.link.issueForCheckoutKey(KEY);
  assert.notEqual(fresh.code,code);
  assert.equal(await f.link.verifyActiveSession({orderId:ID,gamertag:NAME,
    sessionId:"session-A"}),false);
});
test("expired or superseded codes never bind the wrong order or player",async()=>{
  const f=fixture(),{code}=await f.link.issueForCheckoutKey(KEY);
  f.clock(10*60*1000+1);
  await assert.rejects(()=>f.link.claimInGame({code,gamertag:NAME,
    sessionId:"session-A"},()=>true),/invalid_or_expired_code/);
  const newer=await f.link.issueForCheckoutKey(KEY);
  await assert.rejects(()=>f.link.claimInGame({code,gamertag:NAME,
    sessionId:"session-A"},()=>true),/pairing_state_mismatch|invalid_or_expired_code/);
  assert.notEqual(code,newer.code);
});
test("rate-limits reissues: at most five codes per order each 24 hours",async()=>{
  const f=fixture();let last="";
  for(let n=0;n<5;n++){
    const x=await f.link.issueForCheckoutKey(KEY);
    assert.notEqual(x.code,last);last=x.code;
    f.clock(10*60*1000+1);
  }
  await assert.rejects(()=>f.link.issueForCheckoutKey(KEY),/pairing_rate_limit/);
  f.clock(24*60*60*1000);
  assert.ok((await f.link.issueForCheckoutKey(KEY)).code);
});
test("cancelled, forged or unreviewed order cannot mint a voucher",async()=>{
  const f=fixture(); const order=f.db.records.get("pixCommercialOrders/"+ID);
  for(const patch of [
    {state:"cancelled"},
    {state:"refunded"},
    {checkoutOrigin:"fake_browser_order"},
    {catalogValidated:false},
    {gamertag:" Another"},
    {requestHash:"invalid"},
  ]){
    Object.assign(order,{state:"pending",checkoutOrigin:"netcraft_commercial_checkout_v1",
      catalogValidated:true,gamertag:NAME,requestHash:"a".repeat(64)},patch);
    await assert.rejects(()=>f.link.issueForCheckoutKey(KEY),/order_not_eligible/);
  }
});
test("missing secret fails closed; code contains no usable payment authorization",()=>{
  const db=memoryDB() as any;
  assert.throws(()=>createCommercialGamePairing(db,{hashSecret:"short"}),
    /pairing_configuration_missing/);
  const source=JSON.stringify([...db.records.entries()]);
  assert.equal(source.includes("APP_USR-"),false);
});
