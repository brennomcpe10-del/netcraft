import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- isolated Cloudflare candidate is plain ESM
import gateway, { FixtureDeliveryGate } from "../sandbox/cloudflare/verified-fixture-gateway.mjs";
// @ts-ignore -- verified Bedrock protocol is vanilla JavaScript
import { validateVerifiedOutboxResponse } from "../minecraft/delivery-e2e-local/verified_outbox_protocol.js";

const token = "a".repeat(64);
const player = "Lab Tester";
const kitId = "a".repeat(64)+"-0", vipId="a".repeat(64)+"-1";
function harness() {
  const data = new Map<string, unknown>();
  const ctx = {storage:{kv:{
    get:(key:string)=>data.get(key),
    put:(key:string,value:unknown)=>{data.set(key,value);},
    delete:(key:string)=>{data.delete(key);},
  }}};
  let gate = new FixtureDeliveryGate(ctx);
  const env = {
    NC_SANDBOX_ENABLED: "true", NC_FIXTURE_DELIVERY_ENABLED: "true",
    NC_BDS_TEST_TOKEN: token, NC_TEST_GAMERTAG: player,
    FIXTURE_GATE: {
      idFromName:(name:string)=>name,
      get:()=>({fetch:(url:string,init:RequestInit)=>
        gate.fetch(new Request(url,init))}),
    },
  };
  const req=(path:string,body:any={},nonce?:string,auth=token,stamp=Date.now()) =>
    new Request("https://isolated.invalid"+path,{method:"POST",headers:{
      "content-type":"application/json","x-nc-bds-token":auth,
      ...(nonce?{"x-nc-nonce":nonce,"x-nc-timestamp":String(stamp)}:{}),
    },body:JSON.stringify(body)});
  const post=async(path:string,body:any={},nonce?:string,auth=token,stamp=Date.now())=>{
    const r=await gateway.fetch(req(path,body,nonce,auth,stamp),env);
    return {status:r.status,data:await r.json()};
  };
  const nonce=async()=>{const c=await post("/delivery/challenge");assert.equal(c.status,200);assert.match(c.data.nonce,/^[a-f0-9]{32}$/);return c.data.nonce as string;};
  return {env,req,post,nonce,restart:()=>{gate=new FixtureDeliveryGate(ctx);},data};
}
test("fixture gateway is OFF by default, never authorizes real payments, has no seed/refund endpoint",async()=>{
  const h=harness();
  assert.equal((await gateway.fetch(h.req("/delivery/poll",{gamertag:player},"b".repeat(32)),{
    ...h.env,NC_FIXTURE_DELIVERY_ENABLED:"false"
  })).status,503);
  assert.equal((await gateway.fetch(h.req("/delivery/poll",{gamertag:player},"b".repeat(32)),{
    ...h.env,VERCEL_ENV:"preview"
  })).status,503);
  assert.equal((await h.post("/delivery/refund",{})).status,404);
  assert.equal((await h.post("/seed",{})).status,404);
  const response=await gateway.fetch(new Request("https://isolated.invalid/health"),h.env);
  assert.deepEqual(await response.json(),{
    simulation:true,environment:"verified_pix_emulator",
    dispatchEnabled:false,realPayments:false,deliveryEnabled:false,
  });
});
test("durable fixture poll delivers 2 sandbox grants once, safe NACK/retry and exact ACK",async()=>{
  const h=harness();
  const bad=await h.post("/delivery/challenge",{} ,undefined,"not-the-token");
  assert.equal(bad.status,401);
  const n=await h.nonce();
  assert.equal((await h.post("/delivery/poll",{gamertag:"Other"},n)).status,403);
  const first=await h.post("/delivery/poll",{gamertag:player},n);
  assert.equal(first.status,200);
  assert.equal(first.data.dispatchEnabled,false);
  const jobs=validateVerifiedOutboxResponse(first.data,player);
  assert.ok(jobs);
  assert.deepEqual(jobs.map((j:any)=>j.id),[kitId,vipId]);
  assert.deepEqual(jobs[0].items,[
    {itemId:"minecraft:diamond",quantity:3},
    {itemId:"minecraft:iron_ingot",quantity:6},
  ]);
  assert.equal((await h.post("/delivery/poll",{gamertag:player},n)).status,401);

  // Restart the Durable Object, not its backing storage.
  h.restart();
  const again=await h.post("/delivery/poll",{gamertag:player},await h.nonce());
  assert.deepEqual(again.data.deliveries,[], "ambiguous offers must never auto-replay");

  const nacked=await h.post("/delivery/nack",{
    deliveryId:kitId,reason:"inventory_full",receipt:"none",
  },await h.nonce());
  assert.equal(nacked.status,200);
  assert.equal(nacked.data.retryable,true);

  const retry=await h.post("/delivery/poll",{gamertag:player},await h.nonce());
  assert.equal(retry.status,200);
  assert.deepEqual(retry.data.deliveries.map((j:any)=>j.id),[kitId]);
  const ack=await h.post("/delivery/ack",{
    deliveryId:kitId,result:"applied",
  },await h.nonce());
  assert.equal(ack.status,200);
  assert.equal(ack.data.acknowledged,true);
  const vipAck=await h.post("/delivery/ack",{
    deliveryId:vipId,result:"applied",
  },await h.nonce());
  assert.equal(vipAck.status,200);
  h.restart();
  assert.deepEqual((await h.post("/delivery/poll",{
    gamertag:player,
  },await h.nonce())).data.deliveries,[]);
  assert.equal((await h.post("/delivery/ack",{
    deliveryId:kitId,result:"applied",
  },await h.nonce())).data.acknowledged,true);
});
test("replay, stale timestamps and unsafe NACK cannot release a previously offered job",async()=>{
  const h=harness();
  const n=await h.nonce();
  assert.equal((await h.post("/delivery/poll",{gamertag:player},n,"invalid")).status,401);
  assert.equal((await h.post("/delivery/poll",{gamertag:player},n,token,Date.now()-120000)).status,401);
  assert.equal((await h.post("/delivery/poll",{gamertag:player},n)).status,200);
  const unsafe=await h.post("/delivery/nack",{
    deliveryId:kitId,reason:"inventory_full",receipt:"started",
  },await h.nonce());
  assert.equal(unsafe.status,409);
  const unconfirmed=await h.post("/delivery/poll",{gamertag:player},await h.nonce());
  assert.deepEqual(unconfirmed.data.deliveries,[]);
});
