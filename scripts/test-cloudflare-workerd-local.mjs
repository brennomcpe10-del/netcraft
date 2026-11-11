// Optional real workerd/SQLite smoke test. Runs ONLY locally, never deploys.
// Requires Wrangler CLI installed, Node >=20, and sandbox/cloudflare sources.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import crypto from "node:crypto";

const cwd=resolve("sandbox/cloudflare");
const dir=mkdtempSync(join(tmpdir(),"nc-workerd-"));
const persist=join(dir,"state");
const config=join(dir,"wrangler.integration.toml");
const port=18787;
const token=crypto.randomBytes(32).toString("hex");
const worker=resolve(cwd,"worker.mjs").replaceAll("\\","/");
writeFileSync(config,[
  'name = "netcraft-delivery-local-integration-only"',
  'main = '+JSON.stringify(worker),
  'compatibility_date = "2026-10-01"',
  'workers_dev = false',
  '[vars]',
  'NC_SANDBOX_ENABLED = "true"',
  'NC_CHALLENGE_REQUIRED = "true"',
  'NC_BDS_TEST_TOKEN = '+JSON.stringify(token),
  '[[durable_objects.bindings]]',
  'name = "NONCE_GATE"',
  'class_name = "NonceGate"',
  '[[migrations]]',
  'tag = "v1"',
  'new_sqlite_classes = ["NonceGate"]',
].join("\n")+"\n");
mkdirSync(persist,{recursive:true});
// Launch Wrangler via its JS entry point, not the Windows .cmd shim.
function wranglerEntry() {
  const roots = [
    process.env.APPDATA && join(process.env.APPDATA, "npm", "node_modules", "wrangler", "bin", "wrangler.js"),
    process.env.npm_config_prefix && join(process.env.npm_config_prefix, "node_modules", "wrangler", "bin", "wrangler.js"),
    ...String(process.env.PATH || "").split(process.platform === "win32" ? ";" : ":")
      .map(p => p && join(p, "node_modules", "wrangler", "bin", "wrangler.js")),
  ].filter(Boolean);
  const found = roots.find(existsSync);
  if (!found) throw new Error("Cannot find Wrangler JS entry point; ensure Wrangler is installed globally via npm");
  return found;
}
const launch=(args)=>spawn(process.execPath,[wranglerEntry(),...args],
  {cwd,env:{...process.env,WRANGLER_SEND_METRICS:"false"},stdio:"inherit",shell:false});
const root="http://127.0.0.1:"+port;
const nonce=crypto.randomBytes(16).toString("hex");
const makeRequest=(id,auth=token,offset=0,route="/delivery/poll")=>
  fetch(root+route,{method:"POST",headers:{"content-type":"application/json",
    "x-nc-bds-token":auth,"x-nc-nonce":id,
    "x-nc-timestamp":String(Date.now()+offset)},
    body:JSON.stringify(route==="/delivery/ack"?
      {deliveryId:"a".repeat(64)+"-1"}:{gamertag:"JogadorTeste"})});
let child;
async function start(){
  child=launch(["dev","--local","--ip","127.0.0.1","--port",String(port),
    "--persist-to",persist,"--config",config]);
  for(let i=0;i<100;i++){
    if(child.exitCode!==null)throw new Error("workerd exited before ready");
    try{const r=await fetch(root+"/health");if(r.ok)return;}catch{}
    await sleep(250);
  }
  throw new Error("workerd not ready");
}
async function stop(){
  if(!child)return;
  const running=child;child=undefined;
  if(process.platform==="win32"){
    await new Promise(r=>{const killer=spawn("taskkill",["/pid",String(running.pid),"/t","/f"]);killer.on("exit",r);killer.on("error",r);});
  }else running.kill("SIGTERM");
  await Promise.race([new Promise(r=>running.once("exit",r)),sleep(3000)]);
  try{running.kill("SIGKILL");}catch{}
}
try{
  await start();
  const issue=async()=>{
    const r=await makeRequest("",token,0,"/delivery/challenge");
    if(r.status!==200)throw new Error("challenge issuance "+r.status);
    const body=await r.json();
    if(body.simulation!==true||!/^[a-f0-9]{32}$/.test(body.nonce))throw new Error("invalid challenge");
    return body.nonce;
  };
  let r=await makeRequest(nonce);
  if(r.status!==401)throw new Error("unissued nonce allowed");
  const issued=await issue();
  r=await makeRequest(issued);
  if(r.status!==200)throw new Error("issued poll rejected "+r.status);
  r=await makeRequest(issued);
  if(r.status!==401||(await r.json()).error!=="replay")throw new Error("replay failed");
  r=await makeRequest(await issue(),"bad");
  if(r.status!==401)throw new Error("bad token allowed");
  const stale=await issue();
  r=await makeRequest(stale,token,-120000);
  if(r.status!==401)throw new Error("stale accepted");
  r=await makeRequest(stale);
  if(r.status!==200)throw new Error("stale consumed challenge");
  const future=await issue();
  r=await makeRequest(future,token,120000);
  if(r.status!==401)throw new Error("future accepted");
  // Opt-in real-time expiry test: this intentionally takes longer than 60 seconds.
  // NC_TEST_CHALLENGE_EXPIRY=1 only affects this local temporary workerd instance.
  if(process.env.NC_TEST_CHALLENGE_EXPIRY==="1"){
    const expired=await issue();
    await sleep(61000);
    r=await makeRequest(expired);
    if(r.status!==401||(await r.json()).error!=="challenge_expired_or_unknown")
      throw new Error("expired issued challenge accepted");
  }
  // An invalid token must not consume a previously issued, valid challenge.
  const authGuard=await issue();
  r=await makeRequest(authGuard,"bad");
  if(r.status!==401)throw new Error("invalid token was accepted");
  r=await makeRequest(authGuard);
  if(r.status!==200)throw new Error("invalid token consumed issued challenge");
  const ack=await issue();
  r=await makeRequest(ack,token,0,"/delivery/ack");
  if(r.status!==409)throw new Error("ACK enabled");
  const concurrent=await issue();
  const responses=await Promise.all(Array.from({length:24},()=>makeRequest(concurrent)));
  if(responses.filter(r=>r.status===200).length!==1||responses.filter(r=>r.status===401).length!==23)
    throw new Error("concurrent claims failed: "+responses.map(r=>r.status));
  const persisted=await issue();
  await stop();
  await start();
  r=await makeRequest(persisted);
  if(r.status!==200)throw new Error("issued challenge lost on restart");
  r=await makeRequest(concurrent);
  if(r.status!==401||(await r.json()).error!=="replay")
    throw new Error("consumed challenge lost on restart");
  console.log("PASS: local SQLite DO issued challenges, restart, replay, concurrency, stale token/time and disabled ACK");
}finally{
  await stop();
  rmSync(dir,{recursive:true,force:true});
}
