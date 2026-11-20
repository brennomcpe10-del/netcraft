// PREVIEW LAB handshake: no real commerce, payment provider or Bedrock grant.
import test from "node:test";
import assert from "node:assert/strict";
import {memoryDB} from "./fixtures/pixOrders.ts";
import {createPreviewGameLinkLab} from "../server/delivery/previewGameLinkLab.ts";

const TOKEN="N".repeat(64),GAMERTAG="Halzin5212",NOW=Date.parse("2026-11-07T16:30:00.000Z");
function setup(){
  const db=memoryDB() as any;
  let now=NOW;
  const lab=createPreviewGameLinkLab({db,token:TOKEN,now:()=>now});
  return {db,lab,move:(ms:number)=>{now+=ms;}};
}
test("issues a fake order code without ever reading/writing payment or VIP collections",async()=>{
  const f=setup();
  const code=await f.lab.issue(GAMERTAG);
  assert.match(code.code,/^NC-[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/);
  assert.equal(code.grantsEnabled,false);
  assert.equal(code.simulation,true);
  assert.equal(code.expiresAt,NOW+600000);
  assert.equal((await f.lab.status(code.receiptId)).state,"issued");
  const serialized=JSON.stringify([...f.db.records]);
  assert.equal(serialized.includes(code.code),false);
  assert.equal(serialized.includes(TOKEN),false);
  for(const key of f.db.records.keys()){
    assert.ok(key.startsWith("previewDeliveryLinkLabV1"),key);
  }
  assert.throws(()=>createPreviewGameLinkLab({db:f.db,token:"bad"}),
    /lab_private_config_required/);
});
test("challenge token + nonce + one-use matching game claim -> verified, no VIP",async()=>{
  const f=setup();
  const code=await f.lab.issue(GAMERTAG);
  await assert.rejects(()=>f.lab.challenge({schema:1},"wrong-token"),
    /unauthorized_bds/);
  const challenge=await f.lab.challenge({schema:1},TOKEN);
  assert.equal(challenge.dispatchEnabled,false);
  assert.equal(challenge.simulation,false);
  const first={code:code.code,gamertag:GAMERTAG,sessionId:"bedrock-entity-uuid"};
  const headers={token:TOKEN,nonce:challenge.nonce,timestamp:challenge.timestamp};
  await assert.rejects(()=>f.lab.link(first,{...headers,token:"F".repeat(64)}),
    /unauthorized_bds/);
  const result=await f.lab.link(first,headers);
  assert.equal(result.status,"verified_in_game");
  assert.equal(result.grantsEnabled,false);
  assert.equal(result.simulation,true);
  assert.equal(result.gamertag,GAMERTAG);
  assert.match(result.orderId,/^[a-f0-9]{64}$/);
  assert.equal((await f.lab.status(code.receiptId)).state,"verified_in_game");
  await assert.rejects(()=>f.lab.link(first,headers),
    /challenge_expired_or_replayed/);
  const other=await f.lab.challenge({schema:1},TOKEN);
  await assert.rejects(()=>f.lab.link(first,{
    token:TOKEN,nonce:other.nonce,timestamp:other.timestamp,
  }),/invalid_or_expired_lab_code/);
});
test("wrong username never consumes code; challenge is consumed even on rejection",async()=>{
  const f=setup();
  const {code}=await f.lab.issue(GAMERTAG);
  const challenge=await f.lab.challenge({schema:1},TOKEN);
  const headers={token:TOKEN,nonce:challenge.nonce,timestamp:challenge.timestamp};
  await assert.rejects(()=>f.lab.link({
    code,gamertag:"WrongGamer",sessionId:"online-player-id",
  },headers),/invalid_or_expired_lab_code/);
  await assert.rejects(()=>f.lab.link({
    code,gamertag:GAMERTAG,sessionId:"online-player-id",
  },headers),/challenge_expired_or_replayed/);
  const next=await f.lab.challenge({schema:1},TOKEN);
  assert.equal((await f.lab.link({code,gamertag:GAMERTAG,
    sessionId:"online-player-id"},{
    token:TOKEN,nonce:next.nonce,timestamp:next.timestamp,
  })).status,"verified_in_game");
});
test("10 minute expiration, stale challenge and 24h issuance cap fail closed",async()=>{
  const f=setup(),first=await f.lab.issue(GAMERTAG);
  const ch=await f.lab.challenge({schema:1},TOKEN);
  f.move(60001);
  await assert.rejects(()=>f.lab.link({
    code:first.code,gamertag:GAMERTAG,sessionId:"p",
  },{token:TOKEN,nonce:ch.nonce,timestamp:ch.timestamp}),
  /unauthorized_or_stale_challenge/);
  f.move(540000);
  assert.equal((await f.lab.status(first.receiptId)).state,"expired");
  for(let i=0;i<4;i++){
    await f.lab.issue(GAMERTAG);
    f.move(600001);
  }
  await assert.rejects(()=>f.lab.issue(GAMERTAG),/lab_code_rate_limited/);
  f.move(86400000);
  assert.ok((await f.lab.issue(GAMERTAG)).code);
});
test("rejects empty names, invalid payloads and invalid challenge body",async()=>{
  const f=setup();
  await assert.rejects(()=>f.lab.issue(" Other "),/invalid_gamertag/);
  await assert.rejects(()=>f.lab.issue("x"),/invalid_gamertag/);
  await assert.rejects(()=>f.lab.challenge({schema:1,dispatchEnabled:true},TOKEN),
    /invalid_challenge/);
  const ch=await f.lab.challenge({schema:1},TOKEN);
  await assert.rejects(()=>f.lab.link({code:"fake"},{
    token:TOKEN,nonce:ch.nonce,timestamp:ch.timestamp,
  }),/invalid_game_link_body/);
  await assert.rejects(()=>f.lab.link({code:"fake"},{
    token:TOKEN,nonce:ch.nonce,timestamp:ch.timestamp,
  }),/challenge_expired_or_replayed/);
});
