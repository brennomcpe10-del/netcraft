import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
// @ts-ignore Plain JS Bedrock module.
import { sha256, hmacSha256Hex, createBedrockTestSigner } from "../minecraft/delivery-simulation/hmacSha256.js";
// @ts-ignore Plain JS Bedrock bridge.
import { createSignedBedrockHttpsBridge } from "../minecraft/delivery-simulation/signedHttpsBridge.js";
test("pure JS SHA256 and HMAC match Node crypto across UTF-8, blocks and long keys", () => {
  const samples=["", "abc", "NetCraftBR", "áé😀", "a".repeat(120), "b".repeat(800)];
  for(const sample of samples){
    assert.equal(Buffer.from(sha256(sample)).toString("hex"),crypto.createHash("sha256").update(sample).digest("hex"));
    for(const secret of ["test-secret-key-with-at-least-32-characters", "x".repeat(100)]){
      assert.equal(hmacSha256Hex(secret,sample),crypto.createHmac("sha256",secret).update(sample).digest("hex"));
    }
  }
  assert.throws(() => hmacSha256Hex("too-short", "message"));
  assert.throws(() => createBedrockTestSigner(null));
});
test("Bedrock bridge accepts server-secret signer without embedding a key",async()=>{
  const secret="external-test-secret-for-demo-only-32-bytes";
  const sign=createBedrockTestSigner(()=>secret);
  class Request { constructor(public url:string) {} method=""; timeout=0;body="";headers:{key:string;value:string}[]=[]; }
  const bridge=createSignedBedrockHttpsBridge({
    enabled:true,simulation:true,origin:"https://demo.invalid",sign,
    nonce:()=> "a".repeat(32),now:()=> 1793370000000,
    HttpRequest:Request,methods:{Post:"POST"},
    http:{request:async(r:Request)=>{
      const header=(key:string)=>r.headers.find(h=>h.key===key)?.value;
      const path=new URL(r.url).pathname.slice("/delivery".length);
      const signed=["POST",path,header("x-nc-timestamp"),header("x-nc-nonce"),r.body].join("\n");
      assert.equal(header("x-nc-signature"),crypto.createHmac("sha256",secret).update(signed).digest("hex"));
      return {status:200,body:JSON.stringify({deliveries:[]})};
    }}
  });
  assert.deepEqual((await bridge.poll("Player")) as any,{ok:true,jobs:[]});
});
