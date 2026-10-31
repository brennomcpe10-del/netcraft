// Optional real workerd/SQLite smoke test. Runs ONLY locally, never deploys.
// Requires Wrangler CLI installed, Node >=20, and sandbox/cloudflare sources.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
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
  'NC_BDS_TEST_TOKEN = '+JSON.stringify(token),
  '[[durable_objects.bindings]]',
  'name = "NONCE_GATE"',
  'class_name = "NonceGate"',
  '[[migrations]]',
  'tag = "v1"',
  'new_sqlite_classes = ["NonceGate"]',
].join("\n")+"\n");
mkdirSync(persist,{recursive:true});
const exe="wrangler";
const launch=(args)=>{
  if(process.platform!=="win32") return spawn(exe,args,
    {cwd,env:{...process.env,WRANGLER_SEND_METRICS:"false"},stdio:"ignore"});
  // Windows .cmd shims cannot be executed directly with shell:false.
  // Invoke cmd.exe explicitly to avoid Node DEP0190 and keep the command local.
  // Temp paths come from mkdtempSync; reject unsafe shell characters.
  for(const arg of args) if (/[%"!^&|<>\r\n]/.test(arg))
    throw new Error("Unsafe Windows test argument");
  const command=["wrangler.cmd",...args.map(a=>'"'+a+'"')].join(" ");
  return spawn(process.env.ComSpec||"cmd.exe",["/d","/s","/c",command],
    {cwd,env:{...process.env,WRANGLER_SEND_METRICS:"false"},stdio:"ignore",shell:false});
};
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
  let r=await makeRequest(nonce);if(r.status!==200)throw new Error("first claim "+r.status);
  r=await makeRequest(nonce);if(r.status!==401||(await r.json()).error!=="replay")throw new Error("replay failed");
  r=await makeRequest(crypto.randomBytes(16).toString("hex"),"bad");if(r.status!==401)throw new Error("bad token allowed");
  r=await makeRequest(crypto.randomBytes(16).toString("hex"),token,-120000);if(r.status!==401)throw new Error("stale allowed");
  r=await makeRequest(crypto.randomBytes(16).toString("hex"),token,0,"/delivery/ack");if(r.status!==409)throw new Error("ACK enabled");
  const same=crypto.randomBytes(16).toString("hex");
  const responses=await Promise.all(Array.from({length:24},()=>makeRequest(same)));
  if(responses.filter(r=>r.status===200).length!==1||responses.filter(r=>r.status===401).length!==23)
    throw new Error("concurrency invariant failed: "+responses.map(r=>r.status));
  await stop();
  await start();
  r=await makeRequest(nonce);
  if(r.status!==401||(await r.json()).error!=="replay")throw new Error("nonce lost on workerd restart");
  console.log("PASS: local SQLite DO restart, concurrency, stale token/time and disabled ACK");
}finally{
  await stop();
  rmSync(dir,{recursive:true,force:true});
}
