import {test} from "node:test";
import assert from "node:assert/strict";
// @ts-ignore plain Node ESM script has no TypeScript declarations
import {scanDeliverySources} from "../scripts/verify-delivery-secrets.mjs";
test("33: secret scanner detects private credentials without echoing them",()=>{
 const samples=[
  {path:"server/bad.ts",source:'const MERCADOPAGO_ACCESS_TOKEN = "fake-token-string-must-never-be-reported-123456";'},
  {path:"server/bad2.ts",source:'console.error(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);'},
  {path:"sandbox/cloudflare/bad.mjs",source:"-----BEGIN RSA PRIVATE KEY-----"},
 ];
 const findings=scanDeliverySources(samples);
 assert.equal(findings.some((f:any)=>f.code==="hardcoded_server_credential"),true);
 assert.equal(findings.some((f:any)=>f.code==="credential_log_leak"),true);
 assert.equal(findings.some((f:any)=>f.code==="private_key"),true);
 const result=JSON.stringify(findings);
 assert.equal(result.includes("fake-token-string-must-never-be-reported"),false);
 assert.equal(result.includes("-----BEGIN RSA PRIVATE KEY-----"),false);
 assert.ok(findings.every((f:any)=>/^[a-z_]+$/.test(f.code)&&f.line>=1));
});
test("33: sanitized journal and alert output do not disclose any payment or BDS secret",()=>{
 const good=scanDeliverySources([
  {path:"server/safe.ts",source:'console.warn("DELIVERY_ALERT:stale_lease");'},
  {path:"sandbox/cloudflare/safe.mjs",
   source:'const NC_DELIVERY_DEPLOYMENT_LOCK = "OFF";'},
 ]);
 assert.deepEqual(good,[]);
});
