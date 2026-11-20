// Temporary, localhost-only workerd integration. NEVER deploys a Worker.
// Requires explicit NC_FIXTURE_LOCAL_TEST=1 and Node 22+; no production secrets.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import crypto from "node:crypto";
import { createVerifiedCoreLabEngine } from "../minecraft/delivery-v031-core-lab/core_delivery_lab_v031.js";
import { validateVerifiedOutboxResponse } from "../minecraft/delivery-e2e-local/verified_outbox_protocol.js";

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
// The real Core executor runs with a synthetic world / player, not a BDS
// binary. This complements (does not replace) the cloned-world runtime test.
const receipts=new Map(), inventory=[];
let freeSlots=0, vipGrants=0;
const fakePlayer={
 isValid:true,name:player,
 getComponent:()=>({container:{
  isValid:true,
  get emptySlotsCount(){return freeSlots-inventory.length;},
  addItem:(stack)=>{inventory.push(stack);return undefined;},
 }})
};
const world={
 getAllPlayers:()=>[fakePlayer],
 getDynamicProperty:(id)=>receipts.get(id),
 setDynamicProperty:(id,value)=>{receipts.set(id,value);}
};
class ItemStack {
 maxAmount=64;
 constructor(typeId,amount){
  if(!["minecraft:diamond","minecraft:iron_ingot"].includes(typeId))
    throw Error("unsupported_fixture_item");
  this.typeId=typeId;this.amount=amount;
 }
}
const Server={VIPSystem:{
 vipRanks:{get:(id)=>id==="ncbr:vip_explorer"?{}:null},
 getVIP:()=>null,
 grantDeliveryVIPLab:()=>{vipGrants++;return "applied";},
}};
const core=()=>createVerifiedCoreLabEngine({world,ItemStack,Server});
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
 const jobs=validateVerifiedOutboxResponse(first.data,player);
 assert(jobs?.length===2,"bedrock_rejects_untrusted_payload");
 assert(core().execute(jobs[0]).status==="inventory_full",
   "inventario_cheio_must_not_write_receipt");
 assert(core().receiptStatus(kit)==="none","inventory_full_has_no_receipt");
 assert(core().execute(jobs[1]).status==="applied","vip_lab_grant_failed");
 assert(vipGrants===1,"vip_grant_count_invalid");
 assert((await post("/delivery/ack",{deliveryId:vip,result:"applied"},await challenge())).status===200,
   "vip_ack_failed");
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
 freeSlots=2;
 const verifiedRetry=validateVerifiedOutboxResponse(retry.data,player);
 assert(verifiedRetry?.length===1,"bedrock_retry_payload_invalid");
 assert(core().execute(verifiedRetry[0]).status==="applied","kit_lab_grant_failed");
 assert(inventory.length===2&&
   inventory[0].typeId==="minecraft:diamond"&&inventory[0].amount===3&&
   inventory[1].typeId==="minecraft:iron_ingot"&&inventory[1].amount===6,
   "kit_inventory_incorrect");
 assert((await post("/delivery/ack",{deliveryId:kit,result:"applied"},await challenge())).status===200,
   "kit_ack_failed");
 assert(core().execute(jobs[0]).status==="already_applied","duplicate_kit_receipt");
 assert(core().execute(jobs[1]).status==="already_applied","duplicate_vip_receipt");
 assert(vipGrants===1,"duplicate_vip_grant");
 await stop();await launch();
 const replay=await post("/delivery/poll",{gamertag:player},await challenge());
 assert(replay.status===200&&replay.data.deliveries.length===0,"acks_lost_on_restart");
 assert(core().execute(jobs[0]).status==="already_applied"&&
   core().execute(jobs[1]).status==="already_applied",
   "persistent_bedrock_receipts_missing");
 assert(inventory.length===2&&vipGrants===1,"duplicate_grant_after_restart");
 console.log("PASS: real LOCAL workerd SQLite + Core executor sandbox: kit, VIP, inventory full, safe retry, ACK, restart and zero duplicate grants. NO real Pix or BDS.");
}finally{
 await stop();
 rmSync(folder,{recursive:true,force:true});
}
