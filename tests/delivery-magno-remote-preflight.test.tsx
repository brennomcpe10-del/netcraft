// Remote MagnoHost transport preflight: strictly Preview, read-only and inert.
// Exercises the actual Express router; no public network, payments or rewards.
import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
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
  assert.equal(manifest.header.version.join("."),"0.1.1");
  assert.deepEqual(manifest.modules.map((m:any)=>m.version),[[0,1,1]]);
  assert.notEqual(manifest.header.uuid,manifest.modules[0].uuid);
  assert.equal(manifest.header.name,"NetCraft Delivery Magno HTTPS Preflight 0.1.1 OFF");
  const src=readFileSync(base+"/scripts/main.js","utf8");
  assert.match(src,/variables\.get\(ENABLE\)!==true/);
  assert.match(src,/variables\.get\(PREVIEW_ONLY\)!==true/);
  assert.match(src,/EXACT_PREVIEW_ORIGIN\.test\(input\)/);
  assert.match(src,/HttpRequestMethod\.Get/);
  assert.match(src,/HttpRequestMethod\.Post/);
  assert.match(src,/HTTPS_GET_POST_PASS_NO_DELIVERIES/);
  assert.match(src,/secrets\.get\(VERCEL_AUTOMATION_SECRET\)/);
  assert.match(src,/new HttpHeader\("x-vercel-protection-bypass",opaqueSecret\)/);
  assert.doesNotMatch(src,/String\(opaqueSecret\)|\.toString\(\)|grantDeliveryVIP|addItem\(|runCommand\(|runInterval|playerSpawn|MERCADOPAGO_/);
  const api=readFileSync("server/routes/api.ts","utf8");
  assert.match(api,/apiRouter\.use\('\/delivery\/remote-preflight',deliveryMagnoPreflightRouter\)/);
  assert.match(api,/apiRouter\.use\('\/delivery\/bds',commercialBdsReleaseRouter\)/);
});


// Invoke the actual Bedrock script in an isolated mock runtime; unlike
// static source checks, this verifies the opaque SecretString gets passed
// UNCHANGED into exactly two HTTPS requests only when opted in.
function mockBedrock(input:{
  enabled?:boolean;
  preview?:boolean;
  origin?:string;
  secret?:unknown;
  status?:number;
}={}){
  const src=readFileSync("minecraft/delivery-magno-preflight/bp/scripts/main.js","utf8")
    .replace(/^import .*;$/gm,"")
    .replace(/^export function /gm,"function ");
  const logs:string[]=[], calls:any[]=[];
  let secretsRead=0;
  const opaque=input.secret;
  const options=new Map<string,unknown>([
    ["ncbr_magno_preflight_enabled",input.enabled??false],
    ["ncbr_magno_preflight_preview_only",input.preview??false],
    ["ncbr_magno_preflight_origin",input.origin??""],
  ]);
  const result={
    schema:1,contract:CONTRACT,environment:"preview",
    simulation:true,transport:"https",dispatchEnabled:false,
    grantsEnabled:false,ackEnabled:false,realPayments:false,
    pingAccepted:true,
  };
  class HttpRequest {
    uri:string;method?:string;timeout?:number;body?:string;headers:any[]=[];
    constructor(uri:string){this.uri=uri;}
  }
  class HttpHeader {
    key:string;value:unknown;
    constructor(key:string,value:unknown){this.key=key;this.value=value;}
  }
  const runtime={
    system:{run:()=>undefined},
    variables:{get:(key:string)=>options.get(key)},
    secrets:{get:(_:string)=>{secretsRead++;return opaque;}},
    http:{request:async(req:any)=>{
      calls.push(req);
      return {status:input.status??200,body:JSON.stringify(result)};
    }},
    HttpRequest,HttpHeader,HttpRequestMethod:{Get:"GET",Post:"POST"},
    console:{warn:(msg:string)=>logs.push(msg)},
  };
  const {runOnce}=runInNewContext(
    src+"\n({runOnce})",runtime,{timeout:1000}) as any;
  return {execute:()=>runOnce() as Promise<void>,calls,logs,
    secretsRead:()=>secretsRead};
}
const PREVIEW_ORIGIN="https://netcraft-k8mwax9ae-brennomcpe10-dels-projects.vercel.app";
test("preflight stays OFF and never reads secrets when disabled",async()=>{
  const opaque=Object.freeze({type:"SecretString"});
  const off=mockBedrock({secret:opaque,origin:PREVIEW_ORIGIN});
  await off.execute();
  assert.equal(off.calls.length,0);
  assert.equal(off.secretsRead(),0);
  assert.deepEqual(off.logs,["[NCBR MAGNO PREFLIGHT] OFF"]);
});
test("malformed or unapproved endpoint is rejected before any secret access",async()=>{
  for(const origin of [
    "http://netcraft-k8mwax9ae-brennomcpe10-dels-projects.vercel.app",
    "https://evil.vercel.app",
    PREVIEW_ORIGIN+"/api/delivery/bds",
    PREVIEW_ORIGIN+"?token=leak",
    PREVIEW_ORIGIN+":8443",
  ]){
    const m=mockBedrock({enabled:true,preview:true,origin,secret:{}});
    await m.execute();
    assert.equal(m.calls.length,0);
    assert.equal(m.secretsRead(),0);
    assert.deepEqual(m.logs,["[NCBR MAGNO PREFLIGHT] OFF"]);
  }
});
test("an explicitly enabled client with missing secret refuses all HTTPS traffic",async()=>{
  const m=mockBedrock({enabled:true,preview:true,origin:PREVIEW_ORIGIN});
  await m.execute();
  assert.equal(m.calls.length,0);
  assert.equal(m.secretsRead(),1);
  assert.deepEqual(m.logs,["[NCBR MAGNO PREFLIGHT] BYPASS_SECRET_NOT_CONFIGURED"]);
});
test("opaque bypass SecretString is passed unmodified in both HTTPS headers",async()=>{
  const opaque=Object.freeze({mockSecret:true});
  const m=mockBedrock({enabled:true,preview:true,origin:PREVIEW_ORIGIN,secret:opaque});
  await m.execute();
  assert.equal(m.calls.length,2);
  assert.deepEqual(m.calls.map(req=>req.method),["GET","POST"]);
  assert.deepEqual(m.calls.map(req=>req.uri),[
    PREVIEW_ORIGIN+"/api/delivery/remote-preflight/health",
    PREVIEW_ORIGIN+"/api/delivery/remote-preflight/ping",
  ]);
  for(const req of m.calls){
    const v=req.headers.find((h:any)=>h.key==="x-vercel-protection-bypass");
    assert.ok(v);
    assert.strictEqual(v.value,opaque);
    assert.equal(req.headers.some((h:any)=>h.key==="x-nc-bds-token"),false);
  }
  assert.equal(m.calls[1].body,JSON.stringify(BODY));
  assert.deepEqual(m.logs,["[NCBR MAGNO PREFLIGHT] HTTPS_GET_POST_PASS_NO_DELIVERIES"]);
});
test("401 from protected Preview stops before POST, never exposes bypass token",async()=>{
  const opaque=Object.freeze({sentinel:"secret-not-for-logging"});
  const m=mockBedrock({enabled:true,preview:true,origin:PREVIEW_ORIGIN,secret:opaque,status:401});
  await m.execute();
  assert.equal(m.calls.length,1);
  assert.deepEqual(m.logs,["[NCBR MAGNO PREFLIGHT] PREVIEW_PROTECTED_401_403"]);
  assert.equal(m.logs.join(" ").includes(opaque.sentinel),false);
});
