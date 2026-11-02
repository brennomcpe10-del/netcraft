// Gate 37: machine-readable CI evidence; does not claim a commercial release.
// This script NEVER calls any external API or reads credential values.
import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {resolve} from "node:path";
const allowed=new Set(["success","failure","cancelled","skipped","pending"]);
const vals={
 security:process.env.GATE_SECURITY||"pending",
 regression:process.env.GATE_REGRESSION||"pending",
 package:process.env.GATE_PACKAGE||"pending",
};
for(const state of Object.values(vals)){
 if(!allowed.has(state))throw Error("invalid_ci_gate_result");
}
const sha=process.env.GITHUB_SHA||"unknown";
if(sha!=="unknown"&&!/^[a-f0-9]{40}$/.test(sha))throw Error("invalid_commit_sha");
const run=process.env.GITHUB_RUN_ID||"unknown";
if(run!=="unknown"&&!/^\d{1,20}$/.test(run))throw Error("invalid_ci_run_id");
const status=Object.values(vals).every(x=>x==="success")?
 "candidate_ci_checks_passed":"candidate_ci_incomplete_or_failed";
const blockers=[
 "Real standalone Firebase staging and backup not provisioned",
 "Isolated Firestore rules not deployed, Production migrations not authorized",
 "Commercial Worker gateway and outbound authenticated BDS bridge not activated",
 "Real Mercado Pago order settlement and refund races not certified end to end",
 "Current production NetCraftCore BP/RP and player identity mapping not homologated",
 "End-to-end live BDS clone, operator delivery/alerting and rollback drill outstanding",
 "Full Preview Quality workflow and Firestore/Workerd jobs must independently pass",
 "Human security review, backups and explicit production release approval required",
];
const report={
 schema:"netcraft.delivery.homologation.ci.v1",
 branch:"redesign-mobile-solaris",commit:sha,
 githubRunId:run,
 githubUrl:run==="unknown"?null:
  "https://github.com/brennomcpe10-del/netcraft/actions/runs/"+run,
 ciChecks:vals,ciStatus:status,
 commercialReleaseAuthorized:false,realPaymentsEnabled:false,
 minecraftRewardsEnabled:false,productionChanges:false,
 remainingBlockers:blockers,
};
const target=resolve("dist/release-gates");
mkdirSync(target,{recursive:true});
writeFileSync(resolve(target,"homologation-ci-evidence.json"),JSON.stringify(report,null,2)+"\n");
const lines=[
 "# NetCraft Delivery — Relatório automático de CI",
 "",
 "Branch: "+report.branch+" | Commit: "+report.commit,
 "Run: "+(report.githubUrl||"não identificado"),
 "",
 "## Resultado dos gates locais",
 ...Object.entries(vals).map(([key,value])=>"- "+key+": **"+value+"**"),
 "",
 "**Resultado:** "+status+"; autorização de produção: **NÃO**.",
 "",
 "## Bloqueios restantes",
 ...blockers.map(x=>"- "+x),
 "",
 "Este arquivo registra apenas o resultado de checks deste workflow. Não prova",
 "homologação BDS real, Firebase publicado, liquidação Pix comercial, recuperação",
 "em produção nem a aprovação humana da implantação.",
];
writeFileSync(resolve(target,"homologation-ci-report.md"),lines.join("\n")+"\n");
console.log("PASS generated non-release CI evidence: "+status);
