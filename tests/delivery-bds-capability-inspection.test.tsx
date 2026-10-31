import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root="minecraft/delivery-simulation/preflight-pack/";
const read=(name:string)=>readFileSync(resolve(root,name),"utf8");
test("preflight entrypoint never imports optional probes or sends authenticated requests",()=>{
 const manifest=JSON.parse(read("manifest.json"));
 const entry=read(manifest.modules[0].entry);
 assert.equal(manifest.modules[0].uuid,"99ac2e49-b003-46fc-8473-55700984acc7");
 assert.doesNotMatch(entry,/capabilityInspection|secretHeaderProbe|http\.request|secrets\.get|runInterval/);
 assert.match(entry,/modo OFF/);
});
test("capability inspector cannot start a transport or verify actual credential use",()=>{
 const source=read("scripts/capabilityInspection.js");
 const statements=source.split("\n").filter(line=>!line.trimStart().startsWith("//")).join("\n");
 assert.match(statements,/runtimeVerified:\s*false/);
 assert.doesNotMatch(statements,/http\.request|new HttpRequest|new HttpHeader|secrets\.get\(/);
 assert.doesNotMatch(statements,/console\.|runInterval|runTimeout/);
});
