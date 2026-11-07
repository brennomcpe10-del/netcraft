// Gate 35: static fail-closed audit of the delivery release candidate.
// No credentials, network access, deploy operation, paid order or world writes.
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import crypto from "node:crypto";
const root=resolve(".");
const load=path=>readFileSync(resolve(root,path),"utf8");
const req=(test,code)=>{if(!test)throw Error("RELEASE_GATE_BLOCKED:"+code);};
export function inspectDeliveryReleaseCandidate(files){
 const issues=[];
 const check=(ok,code)=>{if(!ok)issues.push(code);};
 const rules=files.rules||"";
 const staging=files.staging||"";
 const worker=files.worker||"";
 const config=files.config||"";
 const core=files.core||"";
 const quality=files.quality||"";
 const scanner=files.scanner||"";
 check(rules.includes("DELIVERY STAGING CANDIDATE ONLY - NOT DEPLOYED"),
  "candidate_rules_marker_missing");
 check(/match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/.test(rules),
  "no_catch_all_client_denial");
 const required=["pixCommercialOrders","pixCommercialDeliveries","pixCommercialDeliveryAudit",
 "pixCommercialDeliveryAlerts","pixCommercialPlayerBindings","pixTestOrders",
 "pixTestWebhookReceipts","coupons","orders","players","users"];
 for(const item of required)
  check(rules.includes("match /"+item+"/{"),"private_rules_missing_"+item);
 // Match grants anywhere within a line, including single-line match blocks;
 // Firestore ORs overlapping grants so a deny-all catchall is NOT sufficient.
 for(const line of rules.split("\n")){
  const code=line.replace(/\/\/.*$/,"");
  for(const m of code.matchAll(/\ballow\s+(?:read\s*,\s*)?write\s*:\s*if\s+([^;]+);/g)){
   if(m[1].trim()!=="false")issues.push("unsafe_client_write_grant");
  }
 }
 check(/firebase_projects_not_isolated/.test(staging)&&
   /separate_firebase_projects_not_configured/.test(staging),
   "firebase_isolation_not_failclosed");
 check(/workers_dev\s*=\s*false/.test(config)&&
   /preview_urls\s*=\s*false/.test(config),
   "worker_public_endpoint_enabled");
 check(!/^\s*(?:routes?\s*=|\[\[routes\]\]|\[triggers\])/m.test(config),
   "worker_public_route_present");
 check(/NC_DELIVERY_DEPLOYMENT_LOCK\s*=\s*"OFF"/.test(config),
   "worker_lock_missing");
 check(/return json\(503\)/.test(worker)&&
   !/fetch\(\s*["']https:\/\/api\.mercadopago/i.test(worker),
   "worker_must_be_inert");
 check(core.includes("CLONE_PACKAGE_OFF_NO_GRANTS")&&
  !/(?:http\.request|runInterval|core_delivery_engine|secrets\.get|setDynamicProperty)/.test(core),
  "minecraft_entrypoint_not_inert");
 check(quality.includes("Verify no private credentials")&&
  quality.includes("Delivery candidate Firestore client permissions"),
  "quality_suites_missing");
 check(scanner.includes("scanDeliverySources")&&
  scanner.includes("credential_log_leak"),
  "secret_scanner_missing");
 return {ok:issues.length===0,issues:[...new Set(issues)].sort(),
  dispatchEnabled:false,releasePermitted:false};
}
function snapshot(){
 const paths=[
  ".github/workflows/preview-quality.yml",
  "firestore.rules","firestore.delivery-isolated.rules",
  "sandbox/cloudflare/wrangler.delivery-private-candidate.toml",
  "sandbox/cloudflare/delivery-private-candidate.worker.mjs",
  "minecraft/delivery-core-v040-clone/bp/manifest.json",
  "minecraft/delivery-core-v040-clone/rp/manifest.json",
  "minecraft/delivery-core-v040-clone/bp/scripts/main.js",
  "server/security/firebaseEnvironmentPlan.ts",
  "server/delivery/deliveryQueueMonitor.ts",
  "scripts/verify-delivery-secrets.mjs",
 ];
 const evidence=paths.map(path=>{
  const bytes=readFileSync(resolve(root,path));
  return {path,size:bytes.length,sha256:crypto.createHash("sha256")
   .update(bytes).digest("hex")};
 });
 const results=inspectDeliveryReleaseCandidate({
  rules:load("firestore.delivery-isolated.rules"),
  staging:load("server/security/firebaseEnvironmentPlan.ts"),
  worker:load("sandbox/cloudflare/delivery-private-candidate.worker.mjs"),
  config:load("sandbox/cloudflare/wrangler.delivery-private-candidate.toml"),
  core:load("minecraft/delivery-core-v040-clone/bp/scripts/main.js"),
  quality:load(".github/workflows/preview-quality.yml"),
  scanner:load("scripts/verify-delivery-secrets.mjs"),
 });
 req(results.ok,results.issues.join(","));
 const out={
  schema:"netcraft.delivery.release-check.v1",
  environment:"isolated_candidate",branch:"redesign-mobile-solaris",
  status:"candidate_static_checks_passed",
  releasePermitted:false,dispatchEnabled:false,
  productionBackupCreated:false,liveRulesPublished:false,
  firebaseProjectsCreated:false,cloudflareWorkerDeployed:false,
  verifications:results,evidence,
 };
 const target=resolve(root,"dist/release-gates");
 mkdirSync(target,{recursive:true});
 writeFileSync(resolve(target,"release-readiness.json"),JSON.stringify(out,null,2)+"\n");
 console.log("PASS release gate: "+evidence.length+
   " immutable file hashes; private Worker, candidate Firestore, Firebase split and Bedrock OFF enforced");
}
if(process.argv[1]?.endsWith("check-delivery-release-gates.mjs"))snapshot();
