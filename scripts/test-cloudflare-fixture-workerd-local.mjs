// Temporary, localhost-only workerd integration. NEVER deploys a Worker.
// Requires explicit NC_FIXTURE_LOCAL_TEST=1 and Node 22+; no production secrets.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import crypto from "node:crypto";

if(process.env.NC_FIXTURE_LOCAL_TEST!=="1"||process.env.VERCEL_ENV||
   process.env.MERCADOPAGO_ACCESS_TOKEN||process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  throw Error("temporary_fixture_local_test_only");
const entry=join(execFileSync("npm",["root","-g"],{encoding:"utf8"}).trim(),
  "wrangler","bin","wrangler.js");
if(!existsSync(entry))throw Error("wrangler_missing_in_global_npm_prefix");

const folder=mkdtempSync(join(tmpdir(),"nc-fixture-workerd-"));
const persist=join(folder,"state");
const cfg=join(folder,"wrangler.toml");
const port=18931, root="http://127.0.0.1:"+port;
const token=crypto.randomBytes(32).toString("hex");
const player="Lab Tester";
const kit="a".repeat(64)+"-0", vip="a".repeat(64)+"-1";
const source=resolve("sandbox/cloudflare/verified-fixture-gateway.mjs").replaceAll("\\","/");
mkdirSync(persist,{recursive:true});
writeFileSync(cfg,[
 'name = "nc-fixture-local-only"',
 'main = '+JSON.stringify(source),
 'compatibility_date = "2026-10-01"',
 'workers_dev = false',
 '[vars]',
 'NC_SANDBOX_ENABLED = "true"',
 'NC_FIXTURE_DELIVERY_ENABLED = "true"',
 'NC_TEST_GAMERTAG = '+JSON.stringify(player),
 'NC_BDS_TEST_TOKEN = '+JSON.stringify(token),
 '[[durable_objects.bindings]]',
 'name = "FIXTURE_GATE"',
 'class_name = "FixtureDeliveryGate"',
 '[[migrations]]',
 'tag = "fixture-v1"',
 'new_sqlite_classes = ["FixtureDeliveryGate"]',
].join("\n")+"\n");

let child;
async function launch(){
  child=spawn(process.execPath,[entry,"dev","--local","--ip","127.0.0.1",
    "--port",String(port),"--persist-to",persist,"--config",cfg],
    {cwd:resolve("sandbox/cloudflare"),stdio:["ignore","pipe","pipe"],
      env:{...process.env,WRANGLER_SEND_METRICS:"false"},shell:false});
  // Do not stream Wrangler's logs: they may contain temporary test credentials.
  child.stdout.on("data",()=>{});
  child.stderr.on("data",()=>{});
  for(let i=0;i<100;i++){
    if(child.exitCode!==null)throw Error("workerd_failed_to_start");
    try{const r=await fetch(root+"/health");if(r.ok)return;}catch{}
    await sleep(250);
  }
  throw Error("workerd_readiness_timeout");
}
async function stop(){
  if(!child)return;
  const old=child;child=null;
  if(process.platform==="win32") {
    await new Promise(res=>{const killer=spawn("taskkill",[
      "/pid",String(old.pid),"/t","/f"]);killer.once("exit",res);killer.once("error",res);});
  }else old.kill("SIGTERM");
  await Promise.race([new Promise(res=>old.once("exit",res)),sleep(3000)]);
  try{old.kill("SIGKILL");}catch{}
}
async function post(route,body={},nonce,auth=token,ts=Date.now()){
  const response=await fetch(root+route,{
    method:"POST",headers:{"content-type":"application/json",
      "x-nc-bds-token":auth,
      ...(nonce?{"x-nc-nonce":nonce,"x-nc-timestamp":String(ts)}:{})},
    body:JSON.stringify(body),
  });
  return {status:response.status,data:await response.json()};
}
async function challenge(){
 const response=await post("/delivery/challenge");
 if(response.status!==200||!/^[a-f0-9]{32}$/.test(response.data.nonce||""))
  throw Error("challenge_failed");
 return response.data.nonce;
}
const assert=(value,label)=>{if(!value)throw Error(label);};
try{
 await launch();
 const health=await fetch(root+"/health").then(r=>r.json());
 assert(health.realPayments===false&&health.deliveryEnabled===false,"not_lab");
 assert((await post("/delivery/poll",{gamertag:player},"b".repeat(32),"invalid")).status===401,
   "unauthorized_access");
 const n=await challenge();
 assert((await post("/delivery/poll",{gamertag:"Other"},n)).status===403,"wrong_player");
 const first=await post("/delivery/poll",{gamertag:player},n);
 assert(first.status===200&&first.data.dispatchEnabled===false&&
   first.data.deliveries.length===2,"two_fixture_offers_missing");
 assert(first.data.deliveries[0].id===kit&&first.data.deliveries[1].id===vip,
   "fixture_identity_mismatch");
 assert((await post("/delivery/poll",{gamertag:player},n)).status===401,"nonce_replay");
 const pending=await challenge();
 await stop();
 await launch();
 const held=await post("/delivery/poll",{gamertag:player},pending);
 assert(held.status===200&&held.data.deliveries.length===0,"ambiguous_offer_replayed");
 const safe=await post("/delivery/nack",{deliveryId:kit,reason:"inventory_full",receipt:"none"},await challenge());
 assert(safe.status===200&&safe.data.retryable===true,"safe_nack_failed");
 const retry=await post("/delivery/poll",{gamertag:player},await challenge());
 assert(retry.status===200&&retry.data.deliveries.length===1&&retry.data.deliveries[0].id===kit,
   "safe_retry_not_exact");
 assert((await post("/delivery/ack",{deliveryId:kit,result:"applied"},await challenge())).status===200,
   "kit_ack_failed");
 assert((await post("/delivery/ack",{deliveryId:vip,result:"applied"},await challenge())).status===200,
   "vip_ack_failed");
 await stop();await launch();
 const replay=await post("/delivery/poll",{gamertag:player},await challenge());
 assert(replay.status===200&&replay.data.deliveries.length===0,"acks_lost_on_restart");
 console.log("PASS: real LOCAL workerd SQLite fixture: two grants, nonce, TLS-ready protocol, ACK, NACK, restart and replay. NO real Pix or Minecraft.");
}finally{
 await stop();
 rmSync(folder,{recursive:true,force:true});
}
