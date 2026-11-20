import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validateFirebaseSeparation,stagingReadinessFromEnv} from "../server/security/firebaseEnvironmentPlan.ts";
import {memoryDB} from "./fixtures/pixOrders.ts";
import {createDeliveryQueueMonitor} from "../server/delivery/deliveryQueueMonitor.ts";
// @ts-ignore candidate Worker is source-only ES module
import privateWorker from "../sandbox/cloudflare/delivery-private-candidate.worker.mjs";

const plan={
 isolated_test:{projectId:"demo-netcraft-admin-test",databaseId:"(default)"},
 staging:{projectId:"netcraft-staging-separate",databaseId:"(default)"},
 production:{projectId:"netcraft-production-separate",databaseId:"(default)"},
};
test("30: Firebase lab/staging/production require three distinct project IDs",()=>{
 const good=validateFirebaseSeparation(plan);
 assert.equal(good.deliveriesEnabled,false);
 assert.equal(good.paymentsEnabled,false);
 assert.equal(good.deployed,false);
 assert.notEqual(good.staging.projectId,good.production.projectId);
 assert.throws(()=>validateFirebaseSeparation({...plan,staging:plan.production}),
  /firebase_projects_not_isolated/);
 assert.throws(()=>validateFirebaseSeparation({...plan,isolated_test:plan.staging}),
  /firebase_lab_must_be_demo_project|firebase_projects_not_isolated/);
 assert.deepEqual(stagingReadinessFromEnv({} as any),{
  ready:false,code:"separate_firebase_projects_not_configured",
 });
});
test("31: isolated rules are strict superset of private Delivery collections, old published rules untouched",()=>{
 const proposed=readFileSync("firestore.delivery-isolated.rules","utf8");
 const live=readFileSync("firestore.rules","utf8");
 assert.match(proposed,/DELIVERY STAGING CANDIDATE ONLY - NOT DEPLOYED/);
 for(const collection of ["pixCommercialOrders","pixCommercialDeliveries",
   "pixCommercialDeliveryAudit","pixCommercialDeliveryAlerts",
   "pixCommercialDeliveryNonces","pixCommercialPlayerBindings",
   "pixTestWebhookReceipts","pixTestOrders","pixTestDeliveries",
   "products","vips","orders","coupons","users","tickets","events","test"]){
  assert.match(proposed,new RegExp("match /"+collection+"/\\{"));
 }
 const lines=proposed.split("\n").filter(s=>/^\s*allow.*write:/.test(s));
 assert.ok(lines.length>=20);
 assert.ok(lines.every(s=>/if false;/.test(s)),"no browser writes on any path");
 assert.match(proposed,/match \/\{document=\*\*\} \{ allow read, write: if false; \}/);
 assert.match(live,/allow write: if isValidId\(eventId\);/,
  "existing rules are NOT modified or deployed");
});
test("32: candidate Cloudflare Worker is private, universally disabled and has no deploy routes",async()=>{
 const config=readFileSync("sandbox/cloudflare/wrangler.delivery-private-candidate.toml","utf8");
 assert.match(config,/workers_dev\s*=\s*false/);
 assert.match(config,/preview_urls\s*=\s*false/);
 assert.doesNotMatch(config,/(?:^|\n)\s*(?:route|routes|account_id|zone_id|triggers)\s*=/);
 assert.doesNotMatch(config,/\[\[routes\]\]|\[triggers\]/);
 for(const value of [undefined,{NC_DELIVERY_DEPLOYMENT_LOCK:"OFF",
   NC_COMMERCIAL_DELIVERY_ENABLED:"false",NC_REAL_PAYMENTS_ENABLED:"false",
   NC_PRODUCTION_BDS_ENABLED:"false"},{NC_DELIVERY_DEPLOYMENT_LOCK:"ON"}]){
  const req=new Request("https://private.example/delivery/poll",{
   method:"POST",body:'{"gamertag":"Tester"}',
  });
  const res=await privateWorker.fetch(req,value);
  assert.equal(res.status,503);
  assert.equal((await res.json()).dispatchEnabled,false);
 }
});
test("34: durable queue alerts identify stale leases and refunds, de-duplicate per time window, hide sensitive fields",async()=>{
 const before={NODE_ENV:process.env.NODE_ENV,
  FIRESTORE_EMULATOR_HOST:process.env.FIRESTORE_EMULATOR_HOST,
  VERCEL_ENV:process.env.VERCEL_ENV,
  MERCADOPAGO_ACCESS_TOKEN:process.env.MERCADOPAGO_ACCESS_TOKEN,
  FIREBASE_SERVICE_ACCOUNT_JSON:process.env.FIREBASE_SERVICE_ACCOUNT_JSON};
 try{
  process.env.NODE_ENV="test";
  process.env.FIRESTORE_EMULATOR_HOST="127.0.0.1:8085";
  delete process.env.VERCEL_ENV;delete process.env.MERCADOPAGO_ACCESS_TOKEN;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const db=memoryDB() as any;
  const now=Date.parse("2026-11-02T18:00:00Z");
  const add=(id:string,state:string,details:Record<string,unknown>={})=>{
   db.records.set("pixCommercialDeliveries/"+id,{
    id,state,dispatchEnabled:false,attempts:1,
    orderId:"d".repeat(64),gamertag:"Private Player",
    leaseToken:"confidential-lease-token",paymentSecret:"never-log-this",
    createdAt:new Date(now-20*60_000).toISOString(),...details,
   });
  };
  add("a".repeat(64)+"-0","leased",{
   leasedAt:new Date(now-3*60_000).toISOString(),
  });
  add("b".repeat(64)+"-0","awaiting_receipt");
  add("c".repeat(64)+"-0","refunded_after_ack");
  add("d".repeat(64)+"-0","review_required");
  add("e".repeat(64)+"-0","queued",{attempts:20});
  add("f".repeat(64)+"-0","queued",{attempts:2});
  const run=()=>createDeliveryQueueMonitor(db,{now:()=>now}).scan();
  const result=await run();
  assert.equal(result.created,6);
  assert.equal(result.limitExceeded,false);
  assert.equal(result.dispatchEnabled,false);
  assert.equal(result.notificationsEnabled,false);
  const second=await run();
  assert.equal(second.created,0);
  assert.equal(second.existing,6);
  const entries=[...db.records].filter(([p]:[string,unknown])=>
   p.startsWith("pixCommercialDeliveryAlerts/"));
  assert.equal(entries.length,6);
  const output=JSON.stringify(entries);
  for(const banned of ["Private Player","confidential-lease-token",
   "never-log-this","minecraft:diamond"]){
   assert.equal(output.includes(banned),false);
  }
  assert.ok(entries.every(([,a]:[string,any])=>
   a.state==="unacknowledged"&&a.dispatchEnabled===false &&
   /^[a-f0-9]{64}$/.test(a.sampleHash)));
 }finally{
  for(const [k,v] of Object.entries(before))
   if(v===undefined)delete process.env[k];else process.env[k]=v;
 }
});
test("34: never monitor the real Firebase or create alerts outside isolated emulator",()=>{
 const prev=process.env.NODE_ENV;
 try{
  process.env.NODE_ENV="production";
  assert.throws(()=>createDeliveryQueueMonitor(memoryDB() as any),
   /delivery_monitor_release_blocked/);
 }finally{
  if(prev===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=prev;
 }
});
