import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const dir="minecraft/delivery-simulation/preflight-pack/";
const source=(name:string)=>readFileSync(resolve(dir,name),"utf8");
test("SecretString constructor probe is opt-in and hides runtime errors",()=>{
 const probe=source("scripts/secretHeaderProbe.js");
 const runnable=probe.split("\n").filter(x=>!x.trimStart().startsWith("//")).join("\n");
 assert.match(runnable,/export function makeOpaqueTestAuthorizationHeader\(/);
 assert.match(runnable,/secrets\.get\(SECRET_NAME\)/);
 assert.match(runnable,/new HttpHeader\("x-nc-bds-token", secret\)/);
 assert.match(runnable,/catch\s*\{/);
 assert.match(runnable,/reason: "opaque_header_unavailable"/);
 assert.doesNotMatch(runnable,/console\.|JSON\.stringify\(secret\)|String\(secret\)|http\.request|runInterval|runTimeout/);
});
test("BDS pack import graph remains inert and does not include live transport",()=>{
 const manifest=JSON.parse(source("manifest.json"));
 assert.equal(manifest.modules.length,1);
 assert.equal(manifest.modules[0].entry,"scripts/main.js");
 const entry=source(manifest.modules[0].entry);
 assert.doesNotMatch(entry,/secretHeaderProbe|bedrockSecretHeaderTransport|cloudflareIsolationContract|http\.request/);
 assert.match(entry,/modo OFF/);
});
