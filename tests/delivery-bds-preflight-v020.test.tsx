import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {join} from "node:path";

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
