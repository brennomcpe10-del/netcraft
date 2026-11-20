import {test} from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- standalone pure JavaScript module
import {validateTestPollInput,interpretSandboxResponse,safeOfflinePoll} from "../minecraft/delivery-simulation/cloudflareIsolationContract.js";

test("Bedrock test request validation denies bad names, nonce and timestamps",()=>{
 const now=Date.now();
 assert.equal(validateTestPollInput("OfflinePlayer","a".repeat(32),now,now).ok,true);
 assert.equal(validateTestPollInput("!","a".repeat(32),now,now).reason,"invalid_player");
 assert.equal(validateTestPollInput("OfflinePlayer","not-random",now,now).reason,"invalid_nonce");
 assert.equal(validateTestPollInput("OfflinePlayer","b".repeat(32),now-120000,now).reason,"stale_timestamp");
 assert.equal(validateTestPollInput("OfflinePlayer","b".repeat(32),now+120000,now).reason,"stale_timestamp");
});
test("Bedrock isolated contract strictly refuses all delivery jobs and ACK",()=>{
 assert.deepEqual(interpretSandboxResponse("/poll",200,'{"deliveries":[],"simulation":true}'),{ok:true,jobs:[],simulation:true});
 assert.equal(interpretSandboxResponse("/poll",200,'{"deliveries":[{"id":"x"}],"simulation":true}').reason,"unexpected_jobs");
 assert.equal(interpretSandboxResponse("/poll",200,'{"deliveries":[],"simulation":false}').reason,"unexpected_jobs");
 assert.equal(interpretSandboxResponse("/poll",200,'not-json').reason,"invalid_json");
 assert.equal(interpretSandboxResponse("/poll",401,"{}").reason,"http_rejected");
 assert.equal(interpretSandboxResponse("/ack",409,'{"error":"ack_disabled","simulation":true}').reason,"ack_disabled");
 assert.equal(interpretSandboxResponse("/ack",200,'{"simulation":true,"state":"simulated_complete"}').reason,"ack_unavailable");
});
test("offline-player sandbox gate prevents poll even for a valid player",()=>{
 assert.equal(safeOfflinePoll(false,"OfflinePlayer").reason,"offline");
 assert.equal(safeOfflinePoll(true,"!").reason,"invalid_player");
 assert.deepEqual(safeOfflinePoll(true,"OfflinePlayer"),{ok:true,gamertag:"OfflinePlayer"});
});
