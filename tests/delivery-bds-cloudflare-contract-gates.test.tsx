import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-ignore -- standalone Cloudflare Worker is deliberately framework-independent
import worker from "../sandbox/cloudflare/worker.mjs";

const source=(path:string)=>readFileSync(resolve(path),"utf8");
const secret="local-test-only-token-32-bytes-long-123456";
const makeEnv=()=>{
  const used=new Set<string>();
  return {
    NC_SANDBOX_ENABLED:"true",
    NC_BDS_TEST_TOKEN:secret,
    NONCE_GATE:{
      idFromName:(s:string)=>s,
      get:()=>({fetch:async (_:string,init:{body:string})=>{
        const {nonce}=JSON.parse(init.body);
        if(used.has(nonce))return new Response("duplicate",{status:409});
        used.add(nonce);return new Response("accepted");
      }})
    }
  };
};
const req=(path:string,nonce:string,body:object,auth=secret,time=Date.now())=>
  new Request("https://isolated.example"+path,{
    method:"POST",
    headers:{"content-type":"application/json","x-nc-bds-token":auth,
      "x-nc-nonce":nonce,"x-nc-timestamp":String(time)},
    body:JSON.stringify(body)
  });
test("isolated Cloudflare protocol: authenticated offline poll is always empty",async()=>{
  const env=makeEnv();
  const r=await worker.fetch(req("/delivery/poll","0".repeat(32),{gamertag:"OfflinePlayer"}),env);
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{deliveries:[],simulation:true});
  assert.equal((await worker.fetch(req("/delivery/poll","0".repeat(32),{gamertag:"OfflinePlayer"}),env)).status,401);
});
test("isolated Cloudflare protocol: ACK cannot succeed even for a synthetic ID",async()=>{
  const env=makeEnv();
  const r=await worker.fetch(req("/delivery/ack","1".repeat(32),{deliveryId:"b".repeat(64)+"-1"}),env);
  assert.equal(r.status,409);
  assert.deepEqual(await r.json(),{error:"ack_disabled",simulation:true});
});
test("invalid headers are denied and no reward routes are exposed",async()=>{
  const env=makeEnv();
  assert.equal((await worker.fetch(req("/delivery/poll","2".repeat(32),{gamertag:"OfflinePlayer"},"wrong"),env)).status,401);
  assert.equal((await worker.fetch(req("/delivery/poll","3".repeat(32),{gamertag:"OfflinePlayer"},secret,Date.now()-120000),env)).status,401);
  assert.equal((await worker.fetch(req("/delivery/seed","4".repeat(32),{}),env)).status,404);
  assert.equal((await worker.fetch(req("/delivery/refund","5".repeat(32),{}),env)).status,404);
  assert.equal((await worker.fetch(req("/delivery/poll","6".repeat(32),{gamertag:"OfflinePlayer"}),{...env,NC_SANDBOX_ENABLED:"false"})).status,503);
});
test("published default config disabled and diagnostic pack is not used as delivery bootstrap",()=>{
  const config=source("sandbox/cloudflare/wrangler.toml");
  assert.match(config,/NC_SANDBOX_ENABLED\s*=\s*"false"/);
  const diagnostic=source("minecraft/delivery-simulation/bedrockNetworkDiagnostic.js");
  assert.match(diagnostic,/const DISABLED\s*=\s*true/);
  const bootstrap=source("minecraft/delivery-simulation/bedrockBootstrapInert.js");
  assert.match(bootstrap,/const ENABLED\s*=\s*false/);
  const netBridge=source("minecraft/delivery-simulation/bedrockSecretHeaderTransport.js");
  assert.match(netBridge,/new HttpHeader\("x-nc-bds-token", token\)/);
  assert.doesNotMatch(netBridge,/runInterval|runTimeout|playerSpawn|give\s+@|grantVip/);
});
