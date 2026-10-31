import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- isolated JavaScript Worker module
import worker from "../sandbox/cloudflare/worker.mjs";

const token="local-test-only-credential-0123456789abcdef0123456789abcdef";
function env() {
  const used=new Set<string>();
  return {
    NC_SANDBOX_ENABLED:"true",NC_BDS_TEST_TOKEN:token,
    NONCE_GATE:{
      idFromName:()=> "isolated",
      get:()=>({fetch:async (_url:string,init:{body:string})=>{
        const {nonce}=JSON.parse(init.body);
        if(used.has(nonce))return new Response("duplicate",{status:409});
        used.add(nonce);return new Response("accepted");
      }})
    }
  };
}
function request(path:string,credential=token,nonce="",body:object={}){
 return new Request("https://isolated.invalid"+path,{method:"POST",
   headers:{"content-type":"application/json","x-nc-bds-token":credential,
    "x-nc-nonce":nonce,"x-nc-timestamp":String(Date.now())},
   body:JSON.stringify(body)});
}
test("CSPRNG-issued challenges are unique and support one-time poll only",async()=>{
 const e=env();
 const a=await worker.fetch(request("/delivery/challenge"),e);
 const b=await worker.fetch(request("/delivery/challenge"),e);
 assert.equal(a.status,200);
 assert.equal(b.status,200);
 const x=await a.json() as {nonce:string;simulation:boolean};
 const y=await b.json() as {nonce:string;simulation:boolean};
 assert.equal(x.simulation,true);
 assert.match(x.nonce,/^[a-f0-9]{32}$/);
 assert.notEqual(x.nonce,y.nonce);
 const one=await worker.fetch(request("/delivery/poll",token,x.nonce,{gamertag:"OfflinePlayer"}),e);
 assert.equal(one.status,200);
 assert.deepEqual(await one.json(),{deliveries:[],simulation:true});
 assert.equal((await worker.fetch(request("/delivery/poll",token,x.nonce,{gamertag:"OfflinePlayer"}),e)).status,401);
});
test("challenge requires valid sandbox token and remains disabled publicly",async()=>{
 const e=env();
 assert.equal((await worker.fetch(request("/delivery/challenge","invalid"),e)).status,401);
 assert.equal((await worker.fetch(request("/delivery/challenge",token),{...e,NC_SANDBOX_ENABLED:"false"})).status,503);
 const ack=await worker.fetch(request("/delivery/ack",token,"f".repeat(32),{deliveryId:"a".repeat(64)+"-1"}),e);
 assert.equal(ack.status,409);
});
