import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
const bp=JSON.parse(readFileSync("minecraft/delivery-core-v040-clone/bp/manifest.json","utf8"));
const rp=JSON.parse(readFileSync("minecraft/delivery-core-v040-clone/rp/manifest.json","utf8"));
const entry=readFileSync("minecraft/delivery-core-v040-clone/bp/scripts/main.js","utf8");
const engine=readFileSync("minecraft/delivery-core-v040-clone/core_delivery_engine.js","utf8");
test("28: unique paired manifests, same versions and exact BP→RP dependency",()=>{
 const v=[0,4,0];
 assert.deepEqual(bp.header.version,v);
 assert.deepEqual(rp.header.version,v);
 for(const mod of [...bp.modules,...rp.modules])assert.deepEqual(mod.version,v);
 assert.equal(bp.modules[0].entry,"scripts/main.js");
 assert.equal(bp.modules[0].type,"script");
 assert.equal(rp.modules[0].type,"resources");
 assert.equal(new Set([bp.header.uuid,rp.header.uuid,
  bp.modules[0].uuid,rp.modules[0].uuid]).size,4);
 assert.deepEqual(bp.dependencies,[{module_name:"@minecraft/server",version:"1.17.0"},
  {uuid:rp.header.uuid,version:v}]);
 assert.equal(bp.format_version,2);
 assert.equal(rp.format_version,2);
});
test("24/28: clone package entrypoint is OFF and cannot dispatch payments or rewards",()=>{
 assert.match(entry,/CLONE_PACKAGE_OFF_NO_GRANTS/);
 for(const forbidden of ["@minecraft/server-net","@minecraft/server-admin",
  "http.request","runInterval","secrets.get","core_delivery_engine",
  ".execute(","setDynamicProperty("])
  assert.equal(entry.includes(forbidden),false,forbidden);
 assert.match(engine,/verifyLinkedPlayer/);
 assert.match(engine,/vip_upgrade_review_required/);
 for(const rank of ["ncbr:vip_explorer","ncbr:vip_elite","ncbr:vip_supreme"])
  assert.match(engine,new RegExp(rank));
});
test("28: packager builds deterministic importable ZIP with SHA-256 inspection",()=>{
 const result=execFileSync("node",["scripts/package-netcraft-delivery-v040.mjs"],
  {encoding:"utf8"});
 assert.match(result,/PASS clone-only BP\/RP version/);
 const integrity=JSON.parse(readFileSync("dist/bds-off/netcraft-delivery-v040-integrity.json","utf8"));
 assert.equal(integrity.version,"0.4.0");
 assert.equal(integrity.dispatchEnabled,false);
 assert.equal(integrity.productionReady,false);
 assert.match(integrity.sha256,/^[0-9a-f]{64}$/);
});
