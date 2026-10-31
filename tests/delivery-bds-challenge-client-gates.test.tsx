import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
const read=(f:string)=>readFileSync(resolve(f),"utf8");
test("BDS challenge-poll is opt-in, offline-gated, has no rewards and uses opaque SecretString",()=>{
 const s=read("minecraft/delivery-simulation/bedrockSecretHeaderTransport.js");
 assert.match(s,/export async function isolatedBedrockChallengePoll\(gamertag, isOnline\)/);
 assert.match(s,/if \(isOnline !== true\) return \{ ok: false, reason: "offline" \}/);
 assert.match(s,/variables\.get\("nc_delivery_test_enabled"\) !== true/);
 assert.match(s,/challenge\.timeout = 5/);
 assert.match(s,/origin \+ "\/delivery\/challenge"/);
 assert.match(s,/new HttpHeader\("x-nc-bds-token", token\)/);
 assert.match(s,/data\.simulation !== true/);
 assert.match(s,/isolatedBedrockDemoRequest\("\/poll", gamertag, nonce, Date\.now\(\)\)/);
 const executable=s.split("\n").filter(line=>!line.trimStart().startsWith("//")).join("\n");
 assert.doesNotMatch(executable,/Math\.random|runInterval|runTimeout|playerSpawn|give\s+@|grantVip|console\./);
});
test("BDS preflight entrypoint never activates challenge-poll transport",()=>{
 const main=read("minecraft/delivery-simulation/preflight-pack/scripts/main.js");
 assert.doesNotMatch(main,/isolatedBedrockChallengePoll|bedrockSecretHeaderTransport|delivery\/challenge|http\.request/);
 assert.match(main,/modo OFF/);
});
