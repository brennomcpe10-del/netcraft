import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src=readFileSync(resolve("minecraft/delivery-simulation/bedrockSecretHeaderTransport.js"),"utf8");
test("BDS prototype strictly denies any sandbox delivery jobs",()=>{
  assert.match(src,/result\.deliveries\.length\s*!==\s*0/);
  assert.match(src,/reason:\s*"unexpected_jobs"/);
  assert.doesNotMatch(src,/result\.deliveries\.some\(|jobs:\s*result\.deliveries/);
});
test("BDS test ACK cannot become successful even on forged HTTP 200",()=>{
  assert.match(src,/path\s*===\s*"\/ack"\)\s*return\s*\{\s*ok:\s*false,\s*reason:\s*"ack_disabled"/);
  assert.doesNotMatch(src,/simulated_complete|duplicate:\s*result\.duplicate/);
});
test("BDS test token stays opaque and strict time window protects nonce",()=>{
  assert.match(src,/new HttpHeader\("x-nc-bds-token", token\)/);
  assert.match(src,/Math\.abs\(Date\.now\(\) - Number\(timestamp\)\) > 60000/);
  assert.match(src,/variables\.get\("nc_delivery_test_enabled"\) !== true/);
  assert.doesNotMatch(src,/console\.|runInterval|playerSpawn|grantVip/);
});
