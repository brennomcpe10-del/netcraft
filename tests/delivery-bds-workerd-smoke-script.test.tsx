import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const path=resolve("scripts/test-cloudflare-workerd-local.mjs");
test("real workerd challenge integration script parses on CI",()=>{
 const child=spawnSync(process.execPath,["--check",path],{encoding:"utf8",timeout:10000});
 assert.equal(child.status,0,child.stderr);
});
test("real workerd integration tests issued nonce, restart and concurrent replay",()=>{
 const src=readFileSync(path,"utf8");
 assert.match(src,/NC_CHALLENGE_REQUIRED = "true"/);
 assert.match(src,/\/delivery\/challenge/);
 assert.match(src,/unissued nonce allowed/);
 assert.match(src,/stale consumed challenge/);
 assert.match(src,/issued challenge lost on restart/);
 assert.match(src,/consumed challenge lost on restart/);
 assert.match(src,/length:24/);
 assert.match(src,/ACK enabled/);
 assert.match(src,/shell:false/);
 assert.doesNotMatch(src,/wrangler deploy|--remote/);
});
