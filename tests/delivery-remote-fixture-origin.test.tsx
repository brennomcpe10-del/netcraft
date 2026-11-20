import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
// @ts-ignore: independent BDS JS helper, no browser runtime
import {fixtureGatewayOrigin} from "../minecraft/delivery-e2e-local/fixture_gateway_origin.js";
const valid = "https://netcraft-delivery-fixture-clone-only.lab-account.workers.dev";
test("remote fixture origin rejects arbitrary HTTPS destinations and remains OFF by default",()=>{
  assert.equal(fixtureGatewayOrigin("https://evil.example",false,false),"https://127.0.0.1:18443");
  assert.equal(fixtureGatewayOrigin(undefined,false,false),"https://127.0.0.1:18443");
  assert.equal(fixtureGatewayOrigin(valid,true,true),valid);
  assert.equal(fixtureGatewayOrigin(valid+"/",true,true),valid);
  for(const input of [
    valid+"/delivery/poll",valid+"?q=1",valid+"#bad",valid+":443",
    valid.replace("https:","http:"),valid.replace(".workers.dev",".workers.dev.evil.com"),
    "https://127.0.0.1:18443","https://localhost",
    "https://user:password@netcraft-delivery-fixture-clone-only.lab-account.workers.dev",
    "https://anything.lab-account.workers.dev",
    "https://netcraft-delivery-fixture-clone-only.lab_account.workers.dev",
    "https://netcraft-delivery-fixture-clone-only.lab-account.workers.dev\\bad",
    "","not a URL",null,123,
  ])assert.throws(()=>fixtureGatewayOrigin(input,true,true));
  assert.throws(()=>fixtureGatewayOrigin(valid,true,false));
});
test("remote origin is used only by opt-in BDS emulator, never by public NetCraftCore",()=>{
  const source=readFileSync(new URL("../minecraft/delivery-e2e-local/delivery_verified_outbox_bds.js",import.meta.url),"utf8");
  assert.match(source,/ncbr_fixture_remote_mode_enabled/);
  assert.match(source,/ncbr_fixture_clone_only/);
  assert.match(source,/fixtureGatewayOrigin/);
  assert.ok(source.includes("secrets.get(TOKEN)"));
  assert.ok(source.includes("ncbr_pix_emulator_enabled"));
  assert.ok(!source.includes("ncbr_fixture_remote_mode_enabled')!==false"));
});
