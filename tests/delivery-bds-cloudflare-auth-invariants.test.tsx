import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- test-only Worker, not shipped to a BDS pack
import worker from "../sandbox/cloudflare/worker.mjs";

const token="synthetic-credential-64-char-minimum-0123456789abcdef0123456789";
function fixture(){
  const claimed=new Set<string>();
  const env={
    NC_SANDBOX_ENABLED:"true",NC_BDS_TEST_TOKEN:token,
    NONCE_GATE:{idFromName:()=> "sandbox-only",get:()=>({
      fetch:async (_url:string,init:{body:string})=>{
        const {nonce}=JSON.parse(init.body);
        if(claimed.has(nonce))return new Response("duplicate",{status:409});
        claimed.add(nonce);return new Response("accepted");
      }
    })}
  };
  const post=(route:string,nonce:string,body:object,credential=token,timestamp=Date.now())=>
    worker.fetch(new Request("https://isolated.invalid"+route,{method:"POST",
      headers:{"content-type":"application/json","x-nc-bds-token":credential,
        "x-nc-nonce":nonce,"x-nc-timestamp":String(timestamp)},body:JSON.stringify(body)}),env);
  return {env,claimed,post};
}
test("bad credentials or expired timestamps do not poison a later valid nonce",async()=>{
  const {claimed,post}=fixture();
  const n="a".repeat(32);
  assert.equal((await post("/delivery/poll",n,{gamertag:"OfflinePlayer"},"bad")).status,401);
  assert.equal((await post("/delivery/poll",n,{gamertag:"OfflinePlayer"},token,Date.now()-120000)).status,401);
  assert.equal(claimed.size,0);
  assert.equal((await post("/delivery/poll",n,{gamertag:"OfflinePlayer"})).status,200);
  assert.equal((await post("/delivery/poll",n,{gamertag:"OfflinePlayer"})).status,401);
  assert.equal(claimed.size,1);
});
test("invalid simulated player or ACK payload does not consume a nonce",async()=>{
  const {claimed,post}=fixture();
  const n="b".repeat(32);
  assert.equal((await post("/delivery/poll",n,{gamertag:"!"})).status,400);
  assert.equal((await post("/delivery/ack",n,{deliveryId:"bad"})).status,400);
  assert.equal(claimed.size,0);
  assert.equal((await post("/delivery/poll",n,{gamertag:"OfflinePlayer"})).status,200);
});
test("independent nonce grants no deliveries and valid ACK remains permanently rejected",async()=>{
  const {claimed,post}=fixture();
  const r=await post("/delivery/poll","c".repeat(32),{gamertag:"OfflinePlayer"});
  assert.deepEqual(await r.json(),{deliveries:[],simulation:true});
  const ack=await post("/delivery/ack","d".repeat(32),{deliveryId:"e".repeat(64)+"-1"});
  assert.equal(ack.status,409);
  assert.deepEqual(await ack.json(),{error:"ack_disabled",simulation:true});
  assert.equal(claimed.size,2);
});
test("tampered or unsupported routes never trigger nonce claim",async()=>{
  const {claimed,post}=fixture();
  assert.equal((await post("/delivery/seed","f".repeat(32),{gamertag:"OfflinePlayer"})).status,404);
  assert.equal((await post("/delivery/refund","1".repeat(32),{deliveryId:"a".repeat(64)+"-1"})).status,404);
  assert.equal(claimed.size,0);
});
