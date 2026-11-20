import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {inspectDeliveryReleaseCandidate} from "../scripts/check-delivery-release-gates.mjs";
const source=path=>readFileSync(path,"utf8");
function fixture(){
 return {
  rules:source("firestore.delivery-isolated.rules"),
  staging:source("server/security/firebaseEnvironmentPlan.ts"),
  worker:source("sandbox/cloudflare/delivery-private-candidate.worker.mjs"),
  config:source("sandbox/cloudflare/wrangler.delivery-private-candidate.toml"),
  core:source("minecraft/delivery-core-v040-clone/bp/scripts/main.js"),
  quality:source(".github/workflows/preview-quality.yml"),
  scanner:source("scripts/verify-delivery-secrets.mjs"),
 };
}
test("35: correct candidate passes source gates without authorizing production",()=>{
 const x=inspectDeliveryReleaseCandidate(fixture());
 assert.equal(x.ok,true,x.issues.join(","));
 assert.equal(x.releasePermitted,false);
 assert.equal(x.dispatchEnabled,false);
});
test("35: rejects attempted public Worker activation and routes",()=>{
 const cfg=fixture();
 cfg.config=cfg.config.replace("workers_dev = false","workers_dev = true");
 assert.equal(inspectDeliveryReleaseCandidate(cfg).ok,false);
 cfg.config=fixture().config+"\n[[routes]]\npattern=\"delivery.example/*\"\n";
 assert.ok(inspectDeliveryReleaseCandidate(cfg).issues.includes("worker_public_route_present"));
});
test("35: rejects dangerous Firestore browser writes",()=>{
 const cfg=fixture();
 cfg.rules+="\nmatch /newDanger/{id} { allow write: if true; }\n";
 assert.ok(inspectDeliveryReleaseCandidate(cfg).issues.includes("unsafe_client_write_grant"));
});
test("35: refuses Core activation and missing isolation guards",()=>{
 const cfg=fixture();
 cfg.core+="\nhttp.request(\"https://example.invalid\");\n";
 cfg.staging="";
 const result=inspectDeliveryReleaseCandidate(cfg);
 assert.equal(result.ok,false);
 assert.ok(result.issues.includes("minecraft_entrypoint_not_inert"));
 assert.ok(result.issues.includes("firebase_isolation_not_failclosed"));
});
test("36: release instructions explicitly require backup, restoration and independent approval",()=>{
 const doc=source("docs/netcraft-delivery-release-runbook-36.md").toLowerCase();
 for(const fragment of ["backup","rollback","firestore","vercel",
  "cloudflare","netcraftcore","aprovação","não executar","pagamentos","recompensas",
  "reconciliação","integridade"]){
  assert.ok(doc.includes(fragment),"missing release runbook topic: "+fragment);
 }
});
test("37: final report labels actual limitations, not a commercial release",()=>{
 const doc=source("docs/netcraft-delivery-homologation-final-37.md");
 assert.match(doc,/NÃO HOMOLOGADO PARA PRODUÇÃO/);
 assert.match(doc,/GitHub Actions/);
 assert.match(doc,/Firestore/);
 assert.match(doc,/BDS/);
 assert.match(doc,/Mercado Pago/);
 assert.match(doc,/bloqueios/i);
});
