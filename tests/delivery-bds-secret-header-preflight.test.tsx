import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dir="minecraft/delivery-simulation/preflight-pack/";
const file=(name:string)=>readFileSync(resolve(dir+name),"utf8");
test("BDS preflight has its own script UUID and does not activate a delivery integration",()=>{
  const manifest=JSON.parse(file("manifest.json"));
  assert.equal(manifest.header.name,"NetCraft Delivery Homologacao OFF");
  assert.equal(manifest.modules.length,1);
  assert.notEqual(manifest.header.uuid,manifest.modules[0].uuid);
  assert.notEqual(manifest.modules[0].uuid,"60c499db-2ac2-4b7e-8e68-8132f9b14a88");
  assert.equal(manifest.modules[0].entry,"scripts/main.js");
  const main=file("scripts/main.js");
  assert.doesNotMatch(main,/secretHeaderProbe|http\.request|nc_delivery_homologation_header_token|runInterval/);
  assert.match(main,/modo OFF/);
});
test("optional, unreferenced SecretString header probe neither logs secrets nor performs network calls",()=>{
  const probe=file("scripts/secretHeaderProbe.js");
  assert.match(probe,/secrets\.get\(SECRET_NAME\)/);
  assert.match(probe,/new HttpHeader\("x-nc-bds-token", secret\)/);
  assert.doesNotMatch(probe,/http\.request|console\.|JSON\.stringify\(secret\)|String\(secret\)|runTimeout|runInterval/);
  assert.doesNotMatch(probe,/\b(give|grantVIP|addItem)\s*\(/);
});
