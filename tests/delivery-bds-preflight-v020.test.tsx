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
