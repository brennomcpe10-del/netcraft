// Gate 33: source and diagnostic guard. Never prints detected secrets.
// Only checks current source, not Git history or external provider logs.
import {readFileSync,readdirSync,statSync} from "node:fs";
import {join,relative} from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=fileURLToPath(new URL("../",import.meta.url));
const AREAS=["server","sandbox/cloudflare","minecraft/delivery-core-v040-clone",
  "scripts","src"];
const EXCLUDED=new Set(["node_modules","dist",".git",".next",".vercel",
 "coverage",".turbo","build","out"]);
const EXTENSIONS=new Set([".js",".mjs",".cjs",".ts",".tsx",".json",
 ".toml",".yaml",".yml",".ps1"]);
function ext(filename){const p=filename.lastIndexOf(".");return p>=0?filename.slice(p):"";}
const rules=[
 {code:"private_key",pattern:/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED |DSA )?PRIVATE KEY-----/i},
 {code:"mercado_pago_access_token",pattern:/\b(?:APP_USR|TEST)-[0-9]+-[0-9]+-[a-zA-Z0-9]{12,}\b/},
 {code:"github_personal_access",pattern:/\b(?:gh[pousr]_[a-zA-Z0-9]{30,}|github_pat_[a-zA-Z0-9_]{40,})\b/},
 {code:"cloudflare_or_slack_token",pattern:/\b(?:cfp_[A-Za-z0-9_-]{38,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/},
];
// Public Firebase browser app configuration is NOT an authentication secret.
// Never whitelist private server env vars, even if a source comment says so.
const assignment=/\b(?:MERCADOPAGO_ACCESS_TOKEN|MERCADOPAGO_WEBHOOK_SECRET|FIREBASE_SERVICE_ACCOUNT_JSON|NC_BDS_TEST_TOKEN|NC_DELIVERY_SIGNING_KEY|CLOUDFLARE_API_TOKEN|DISCORD_WEBHOOK_SECRET)\s*[:=]\s*["'][^"'\r\n]{16,}["']/g;
const dangerousLog=/\bconsole\.(?:log|warn|error|debug|info)\s*\([^)]*(?:process\.env|\.headers|\.authorization|\.password|\.accessToken|\.leaseToken|\.signature|JSON\.stringify\(\s*(?:request|body|env)\b)/g;
export function scanDeliverySources(items){
 const findings=[];
 for(const {path,source} of items){
  if(typeof source!=="string")continue;
  const lines=source.split(/\r?\n/);
  for(let n=0;n<lines.length;n++){
   const line=lines[n];
   for(const rule of rules)if(rule.pattern.test(line))
    findings.push({path,line:n+1,code:rule.code});
   assignment.lastIndex=0;
   if(assignment.test(line))findings.push({path,line:n+1,code:"hardcoded_server_credential"});
   dangerousLog.lastIndex=0;
   if(dangerousLog.test(line))findings.push({path,line:n+1,code:"credential_log_leak"});
  }
 }
 return findings;
}
function walk(dir,results=[]){
 for(const name of readdirSync(dir)){
  if(EXCLUDED.has(name))continue;
  const full=join(dir,name),stat=statSync(full);
  if(stat.isDirectory())walk(full,results);
  else if(EXTENSIONS.has(ext(name)))results.push({
   path:relative(ROOT,full).replaceAll("\\","/"),
   source:readFileSync(full,"utf8"),
  });
 }
 return results;
}
if(process.argv[1]?.endsWith("/verify-delivery-secrets.mjs") ||
   process.argv[1]?.endsWith("\\verify-delivery-secrets.mjs")){
 const results=AREAS.flatMap(dir=>walk(join(ROOT,dir)));
 const issues=scanDeliverySources(results);
 if(issues.length){
  for(const issue of issues)console.error("SECRET_GUARD:"+issue.code+":"+
   issue.path+":"+issue.line);
  process.exitCode=1;
 }else console.log("PASS Gate33 source scanner: "+results.length+
  " files checked, no hardcoded private credentials or forbidden log patterns");
}
