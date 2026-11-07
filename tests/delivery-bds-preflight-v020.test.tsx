import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {join} from "node:path";
import {runInNewContext} from "node:vm";

const base=resolve("minecraft/delivery-simulation/preflight-pack");
const manifest=JSON.parse(readFileSync(join(base,"manifest.json"),"utf8"));
test("BDS 0.2.0 preflight keeps its isolated UUID, OFF entrypoint and no live bootstrap",()=>{
 assert.deepEqual(manifest.header.version,[0,2,0]);
 assert.deepEqual(manifest.modules[0].version,[0,2,0]);
 assert.equal(manifest.modules[0].uuid,"99ac2e49-b003-46fc-8473-55700984acc7");
 assert.equal(manifest.modules[0].entry,"scripts/main.js");
 const entry=readFileSync(join(base,manifest.modules[0].entry),"utf8");
 assert.doesNotMatch(entry,/secretHeaderProbe|http\.request|secrets\.get|runInterval|runTimeout/);
 assert.match(entry,/modo OFF/);
});
test("BDS 0.2.0 pack can be archived offline and contains no real credentials",()=>{
 const files=["manifest.json","scripts/main.js","scripts/secretHeaderProbe.js","scripts/capabilityInspection.js"];
 for(const f of files) {
  const body=readFileSync(join(base,f),"utf8");
  assert.doesNotMatch(body,/-----BEGIN (?:PRIVATE KEY|CERTIFICATE)-----|nc_bds_real_token\s*[:=]/i);
 }
});

test("BDS OFF v0.2.0 packaging keeps exact manifest dependency and file allowlist",()=>{
 assert.equal(manifest.header.name,"NetCraft Delivery Homologacao OFF");
 assert.equal(manifest.modules.length,1);
 assert.equal(manifest.modules[0].type,"script");
 assert.deepEqual(manifest.dependencies.map((d:{module_name:string})=>d.module_name).sort(),[
  "@minecraft/server","@minecraft/server-admin","@minecraft/server-net"
 ].sort());
 assert.equal(new Set(manifest.dependencies.map((d:{module_name:string})=>d.module_name)).size,3);
 const packaging=readFileSync(resolve("scripts/build-bds-preflight-off.mjs"),"utf8");
 for(const file of ["manifest.json","scripts/main.js","scripts/secretHeaderProbe.js","scripts/capabilityInspection.js"]){
  assert.ok(packaging.includes(file),`Packaging allowlist missing ${file}`);
 }
 assert.doesNotMatch(packaging,/wrangler deploy|vercel deploy|http\.request\(/);
});
test("BDS OFF entrypoint cannot schedule a hidden trigger or import a transport",()=>{
 const entry=readFileSync(join(base,"scripts/main.js"),"utf8");
 assert.doesNotMatch(entry,/\b(?:runInterval|runTimeout|runJob|subscribe|fetch|eval)\s*\(/);
 assert.doesNotMatch(entry,/from\s*["'][^"']*(?:Probe|Transport|client|Bridge)["']/i);
 assert.doesNotMatch(entry,/\.runCommand(?:Async)?\s*\(/);
});

test("BDS OFF secret header probe stays unreferenced, network-free and opaque",()=>{
 const entry=readFileSync(join(base,"scripts/main.js"),"utf8");
 const probe=readFileSync(join(base,"scripts/secretHeaderProbe.js"),"utf8");
 const inspect=readFileSync(join(base,"scripts/capabilityInspection.js"),"utf8");
 assert.doesNotMatch(entry,/secretHeaderProbe|capabilityInspection|makeOpaqueTestAuthorizationHeader|inspectOpaqueHeaderCompatibility/);
 assert.match(probe,/new HttpHeader\("x-nc-bds-token", secret\)/);
 assert.match(probe,/secrets\.get\(SECRET_NAME\)/);
 assert.match(probe,/opaque_header_unavailable/);
 for(const source of [probe,inspect]){
  assert.doesNotMatch(source,/\b(?:http\.request|fetch|setInterval|setTimeout|runInterval|runTimeout)\s*\(/);
  assert.doesNotMatch(source,/\b(?:console\.(?:log|warn|error)|JSON\.stringify|\.toString)\s*\(/);
  assert.doesNotMatch(source,/\.runCommand(?:Async)?\s*\(/);
 }
});

test("BDS opaque probe mock: missing secret, opaque success and runtime failures fail closed",()=>{
 const probe=readFileSync(join(base,"scripts/secretHeaderProbe.js"),"utf8")
  .replace(/^import .*;\s*$/gm,"")
  .replace("export function makeOpaqueTestAuthorizationHeader","function makeOpaqueTestAuthorizationHeader");
 const source=probe+"\nmakeOpaqueTestAuthorizationHeader()";
 const secret={toString(){throw new Error("opaque secret must not be inspected");}};
 const run=(get:()=>unknown, Header: new (name:string,value:unknown)=>unknown)=>
  runInNewContext(source,{secrets:{get},HttpHeader:Header}) as {ok:boolean,reason?:string,header?:unknown};
 const Header=class{constructor(public name:string,public value:unknown){}};
 const missing=run(()=>undefined,Header);
 assert.equal(missing.ok,false);
 assert.equal(missing.reason,"missing_server_secret");
 const good=run(()=>secret,Header);
 assert.equal(good.ok,true);
 assert.equal((good.header as InstanceType<typeof Header>).value,secret);
 assert.equal((good.header as InstanceType<typeof Header>).name,"x-nc-bds-token");
 for(const failure of [
  ()=>{throw new Error("unsafe internal token detail");},
 ]){
  const result=run(failure,Header);
  assert.equal(result.ok,false);
  assert.equal(result.reason,"opaque_header_unavailable");
  assert.equal(JSON.stringify(result).includes("unsafe internal token detail"),false);
 }
 const badHeader=class{constructor(){throw new Error("unsafe header details");}};
 const bad=run(()=>secret,badHeader);
 assert.equal(bad.ok,false);
 assert.equal(bad.reason,"opaque_header_unavailable");
 assert.equal(JSON.stringify(bad).includes("unsafe header details"),false);
});

test("BDS OFF packaging guard rejects accidental activation patterns",()=>{
 const packaging=readFileSync(resolve("scripts/build-bds-preflight-off.mjs"),"utf8");
 const entry=readFileSync(join(base,"scripts/main.js"),"utf8");
 const guardLine=packaging.split("\n").find(line=>line.startsWith("if(/") && line.includes("Preflight")===false && line.includes("entry))"));
 assert.ok(guardLine,"Missing entrypoint safety check");
 const match=guardLine.match(/^if\((\/.*\/).test\(entry\)\)/);
 assert.ok(match,"Expected explicit regular-expression guard for entrypoint");
 const guard=runInNewContext(match[1]) as RegExp;
 for(const forbidden of ["http.request", "secrets.get", "secretHeaderProbe", "capabilityInspection", "runInterval", "runTimeout", "runJob", "playerSpawn", "runCommand"]){
  assert.equal(guard.test(forbidden),true,`Expected packer to reject ${forbidden}`);
 }
 assert.equal(guard.test(entry),false,"Inert entrypoint must remain packageable");
});

test("BDS OFF version and API versions remain pinned for isolated compatibility review",()=>{
 assert.equal(manifest.format_version,2);
 assert.equal(manifest.header.uuid,"6c521552-24ef-4339-9212-e2a349ace991");
 assert.deepEqual(manifest.header.version,[0,2,0]);
 assert.equal(manifest.modules[0].uuid,"99ac2e49-b003-46fc-8473-55700984acc7");
 assert.deepEqual(Object.fromEntries(manifest.dependencies.map((d:{module_name:string,version:string})=>[d.module_name,d.version])),{
  "@minecraft/server":"1.17.0",
  "@minecraft/server-admin":"1.0.0-beta",
  "@minecraft/server-net":"1.0.0-beta"
 });
 const builder=readFileSync(resolve("scripts/build-bds-preflight-off.mjs"),"utf8");
 assert.match(builder,/Unexpected BDS OFF manifest identity or dependencies/);
});
