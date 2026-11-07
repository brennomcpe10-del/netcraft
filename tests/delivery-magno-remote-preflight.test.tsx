// Remote MagnoHost transport preflight: strictly Preview, read-only and inert.
// Exercises the actual Express router; no public network, payments or rewards.
import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFileSync} from "node:fs";
import express from "express";
import {deliveryMagnoPreflightRouter}
  from "../server/routes/deliveryMagnoPreflight.ts";

const PREFIX="/api/delivery/remote-preflight";
const CONTRACT="netcraft.delivery.remote-preflight.v1";
const BODY={schema:1,probe:CONTRACT};
async function serve<T>(env:string|undefined,run:(base:string)=>Promise<T>){
  const before=process.env.VERCEL_ENV;
  if(env===undefined)delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV=env;
  const app=express();
  app.use(express.json({limit:"2kb"}));
  app.use(PREFIX,deliveryMagnoPreflightRouter);
  const server=createServer(app);
  try{
    await new Promise<void>((resolve,reject)=>
      server.listen(0,"127.0.0.1",()=>{
        resolve();
      }).once("error",reject));
    const port=(server.address() as any).port;
    return await run(`http://127.0.0.1:${port}`);
  }finally{
    await new Promise<void>((resolve,reject)=>
      server.close(err=>err?reject(err):resolve()));
    if(before===undefined)delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV=before;
  }
}
const call=(base:string,path:string,init?:RequestInit)=>
  fetch(base+PREFIX+path,init);

test("Preview GET health returns only a no-grant HTTPS transport contract",async()=>{
  await serve("preview",async(base)=>{
    const r=await call(base,"/health");
    assert.equal(r.status,200);
    assert.equal(r.headers.get("cache-control"),"no-store");
    assert.equal(r.headers.get("x-content-type-options"),"nosniff");
    const j=await r.json() as any;
    assert.deepEqual(j,{
      schema:1,contract:CONTRACT,environment:"preview",simulation:true,
      transport:"https",dispatchEnabled:false,grantsEnabled:false,
      ackEnabled:false,realPayments:false,
    });
  });
});
test("Preview POST ping accepts exact bounded JSON but grants nothing",async()=>{
  await serve("preview",async(base)=>{
    const r=await call(base,"/ping",{method:"POST",
      headers:{"Content-Type":"application/json"},body:JSON.stringify(BODY)});
    assert.equal(r.status,200);
    const j=await r.json() as any;
    assert.equal(j.pingAccepted,true);
    assert.equal(j.ackEnabled,false);
    assert.equal(j.grantsEnabled,false);
    assert.equal(j.dispatchEnabled,false);
    assert.equal(j.realPayments,false);
    for(const altered of [
      {schema:1,probe:CONTRACT,checkoutId:"real-id"},
      {schema:1,probe:"wrong-version"},
      {schema:2,probe:CONTRACT},
    ]){
      const bad=await call(base,"/ping",{method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(altered)});
      assert.equal(bad.status,400);
    }
  });
});
test("Preview rejects auth secrets, query strings, unsupported methods and delivery routes",async()=>{
  await serve("preview",async(base)=>{
    assert.equal((await call(base,"/health?token=leak")).status,400);
    assert.equal((await call(base,"/health",{headers:{"Authorization":"Bearer NEVER_USED"}})).status,400);
    assert.equal((await call(base,"/health",{headers:{"X-NC-BDS-TOKEN":"test"}})).status,400);
    assert.equal((await call(base,"/poll",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"})).status,405);
    assert.equal((await call(base,"/ack",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"})).status,405);
    assert.equal((await call(base,"/ping",{method:"PUT"})).status,405);
  });
});
test("Production or missing Preview environment never exposes the preflight",async()=>{
  for(const environment of ["production","development",undefined]){
    await serve(environment,async(base)=>{
      for(const path of ["/health","/ping"]){
        const r=await call(base,path,path==="/ping"
          ?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(BODY)}
          :undefined);
        assert.equal(r.status,503);
        assert.deepEqual(await r.json(),{error:"remote_preflight_off"});
      }
    });
  }
});
test("Bedrock pack is isolated, OFF by default, no credentials or rewards",()=>{
  const base="minecraft/delivery-magno-preflight/bp";
  const manifest=JSON.parse(readFileSync(base+"/manifest.json","utf8"));
  assert.equal(manifest.header.version.join("."),"0.1.0");
  assert.deepEqual(manifest.modules.map((m:any)=>m.version),[[0,1,0]]);
  assert.notEqual(manifest.header.uuid,manifest.modules[0].uuid);
  assert.equal(manifest.header.name,"NetCraft Delivery Magno HTTPS Preflight OFF");
  const src=readFileSync(base+"/scripts/main.js","utf8");
  assert.match(src,/variables\.get\(ENABLE\)!==true/);
  assert.match(src,/variables\.get\(PREVIEW_ONLY\)!==true/);
  assert.match(src,/EXACT_PREVIEW_ORIGIN\.test\(input\)/);
  assert.match(src,/HttpRequestMethod\.Get/);
  assert.match(src,/HttpRequestMethod\.Post/);
  assert.match(src,/HTTPS_GET_POST_PASS_NO_DELIVERIES/);
  assert.doesNotMatch(src,/secrets\.get|grantDeliveryVIP|addItem\(|runCommand\(|runInterval|playerSpawn|MERCADOPAGO_/);
  const api=readFileSync("server/routes/api.ts","utf8");
  assert.match(api,/apiRouter\.use\('\/delivery\/remote-preflight',deliveryMagnoPreflightRouter\)/);
  assert.match(api,/apiRouter\.use\('\/delivery\/bds',commercialBdsReleaseRouter\)/);
});
