import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-ignore -- standalone module is intentionally not a deployed service
import worker from "../sandbox/cloudflare/worker.mjs";
// @ts-ignore -- test-only simulation adapter
import { NetCraftDeliveryAdapter } from "../minecraft/delivery-simulation/adapter.js";

const read=(path:string)=>readFileSync(resolve(path),"utf8");

test("uninstalled BDS pack remains inert even with test header helper present",()=>{
  const entry=read("minecraft/delivery-simulation/preflight-pack/scripts/main.js");
  const manifest=JSON.parse(read("minecraft/delivery-simulation/preflight-pack/manifest.json"));
  assert.notEqual(manifest.header.uuid,manifest.modules[0].uuid);
  assert.notEqual(manifest.modules[0].uuid,"60c499db-2ac2-4b7e-8e68-8132f9b14a88");
  assert.doesNotMatch(entry,/secretHeaderProbe|http\.request|secrets\.get|x-nc-bds-token|runInterval|playerSpawn/);
  assert.match(read("sandbox/cloudflare/wrangler.toml"),/NC_SANDBOX_ENABLED\s*=\s*"false"/);
});

test("offline → online simulation ACK is idempotent; refund must override pending job",()=>{
  const a=new NetCraftDeliveryAdapter();
  const id="f".repeat(64)+"-1";
  const job={deliveryId:id,gamertag:"OfflinePlayer",kind:"kit",environment:"test",dispatchEnabled:false};
  assert.equal(a.accept(job).ok,true);
  assert.equal(a.acknowledge(id).reason,"offline");
  assert.equal(a.snapshot(id).attempts,0);
  a.setPlayerOnline("OfflinePlayer",true);
  const first=a.acknowledge(id);
  assert.equal(first.realDelivery,false);
  assert.equal(first.duplicate,false);
  assert.equal(a.acknowledge(id).duplicate,true);
  assert.equal(a.snapshot(id).attempts,1);
  const b=new NetCraftDeliveryAdapter();
  b.accept(job);
  b.refund(id);
  b.setPlayerOnline("OfflinePlayer",true);
  assert.equal(b.acknowledge(id).reason,"refunded");
});

test("Cloudflare public-disabled gate refuses all simulated delivery activity",async()=>{
  const env={NC_SANDBOX_ENABLED:"false",NC_BDS_TEST_TOKEN:"a".repeat(64),NONCE_GATE:{}};
  const request=new Request("https://example.invalid/delivery/poll",{method:"POST",
    headers:{"content-type":"application/json","x-nc-bds-token":"a".repeat(64),
      "x-nc-nonce":"b".repeat(32),"x-nc-timestamp":String(Date.now())},
    body:'{"gamertag":"OfflinePlayer"}'});
  const r=await worker.fetch(request,env);
  assert.equal(r.status,503);
  assert.deepEqual(await r.json(),{error:"disabled"});
});
