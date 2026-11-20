// Isolated in-memory tests for durable commercial BDS challenge issuance.
// Production flags are mocked only inside the process; no real money, BDS
// connection, Firestore project or deployed gateway is touched.
import test from "node:test";
import assert from "node:assert/strict";
import {
  issuePersistedPrivateBdsChallenge,
  OpaqueNickBridgeBlocked,
} from "../server/delivery/bdsOpaqueNickReleaseAdapter.ts";
import {
  authenticateBdsRequest,bdsSignature,
} from "../server/delivery/bdsSignedRequest.ts";
import {memoryDB} from "./fixtures/pixOrders.ts";

const NOW=Date.parse("2026-11-06T23:45:00Z");
const SECRET="T".repeat(64);
const HMAC="H".repeat(64);
const KEY_ID="netcraft_nick_private";
const ENV=["NODE_ENV","VERCEL_ENV","FIRESTORE_EMULATOR_HOST",
  "NETCRAFT_DELIVERY_RELEASE_APPROVED","NCBR_COMMERCIAL_MP_ACCESS_TOKEN",
  "NCBR_COMMERCIAL_FIREBASE_SERVICE_ACCOUNT_JSON"];
async function inMockCommercial(fn:()=>Promise<void>){
  const saved=Object.fromEntries(ENV.map(key=>[key,process.env[key]]));
  try{
    process.env.NODE_ENV="production";
    process.env.VERCEL_ENV="production";
    delete process.env.FIRESTORE_EMULATOR_HOST;
    process.env.NETCRAFT_DELIVERY_RELEASE_APPROVED="PRIVATE_GATEWAY_REVIEWED";
    process.env.NCBR_COMMERCIAL_MP_ACCESS_TOKEN="NOT_AN_ACTUAL_TOKEN";
    process.env.NCBR_COMMERCIAL_FIREBASE_SERVICE_ACCOUNT_JSON="NOT_AN_ACTUAL_ACCOUNT";
    await fn();
  }finally{
    for(const key of ENV){
      if(saved[key]===undefined)delete process.env[key];
      else process.env[key]=saved[key];
    }
  }
}
const issue=(db:any,now=NOW,token=SECRET)=>
  issuePersistedPrivateBdsChallenge({
    db,now:()=>now,method:"POST",transportVerified:true,
    body:'{"schema":1}',receivedToken:token,secret:SECRET,
  });
function signed(nonce:string,timestamp:string,key=HMAC){
  const message={action:"poll" as const,
    body:JSON.stringify({gamertag:"SyntheticPlayer",online:true})};
  return {...message,headers:{
    nonce,timestamp,keyId:KEY_ID,
    signature:bdsSignature(key,message,timestamp,nonce,KEY_ID),
  }};
}
const valid=(db:any,msg:ReturnType<typeof signed>,now=NOW)=>
  authenticateBdsRequest(db,msg,{[KEY_ID]:HMAC},now,true);

test("private gateway challenge is persisted first and consumed exactly once",async()=>{
  await inMockCommercial(async()=>{
    const db=memoryDB() as any;
    const challenge=await issue(db);
    assert.equal(challenge.dispatchEnabled,false);
    assert.equal(challenge.simulation,false);
    const msg=signed(challenge.nonce,challenge.timestamp);
    const proved=await valid(db,msg);
    assert.equal(proved.verified,true);
    await assert.rejects(()=>valid(db,msg),/replayed_request/);
    const issued=[...db.records.entries()]
      .filter(([k])=>k.startsWith("pixCommercialIssuedNonces/"));
    assert.equal(issued.length,1);
    assert.equal(issued[0][1].status,"consumed");
    assert.equal([...db.records.keys()]
      .filter(k=>k.startsWith("pixCommercialDeliveryNonces/")).length,1);
  });
});
test("a correctly signed but UNISSUED nonce is refused before any queue access",async()=>{
  await inMockCommercial(async()=>{
    const db=memoryDB() as any;
    const fake=signed("f".repeat(32),String(NOW));
    await assert.rejects(()=>valid(db,fake),/challenge_not_issued_or_expired/);
    assert.deepEqual([...db.records.keys()],[]);
  });
});
test("forged HMAC never consumes an otherwise valid issued nonce",async()=>{
  await inMockCommercial(async()=>{
    const db=memoryDB() as any;
    const challenge=await issue(db);
    const wrong=signed(challenge.nonce,challenge.timestamp,"X".repeat(64));
    await assert.rejects(()=>valid(db,wrong),/unauthorized/);
    assert.equal((await valid(db,signed(challenge.nonce,challenge.timestamp))).verified,true);
  });
});
test("modified timestamp is denied even with a fresh recomputed signature",async()=>{
  await inMockCommercial(async()=>{
    const db=memoryDB() as any;
    const challenge=await issue(db);
    const modified=signed(challenge.nonce,String(NOW+1000));
    await assert.rejects(()=>valid(db,modified,NOW+1000),
      /challenge_not_issued_or_expired/);
    assert.equal((await valid(db,signed(challenge.nonce,challenge.timestamp))).verified,true);
  });
});
test("preview, invalid token and failed persistence do not issue usable challenges",async()=>{
  await inMockCommercial(async()=>{
    const db=memoryDB() as any;
    await assert.rejects(()=>issue(db,NOW,"F".repeat(64)),
      (e:any)=>e instanceof OpaqueNickBridgeBlocked&&
      e.reason==="unauthorized_bds_request");
    assert.equal(db.records.size,0);
    process.env.VERCEL_ENV="preview";
    await assert.rejects(()=>issue(db),/release_not_authorized/);
    process.env.VERCEL_ENV="production";
    await assert.rejects(()=>issue({collection:()=>({
      doc:()=>({create:async()=>{throw Error("firestore_down");}}),
    })}),/firestore_down/);
  });
});
