// LIVE route is OFF. All inputs, payments and BDS APIs below are simulated.
import {test} from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {memoryDB,ordersFixture} from "./fixtures/pixOrders.ts";
import {createNetCraftPreviewVipLabService} from "../server/delivery/netcraftVipPreviewLabService.ts";
import {NETCRAFT_PREVIEW_VIP_APPROVALS} from "../server/delivery/netcraftVipPreviewApproval.ts";
import {NETCRAFT_VIP_TERMS} from "../server/delivery/netcraftVipCatalogApproval.ts";
import {bdsSignature,type BdsSignedMessage} from "../server/delivery/bdsSignedRequest.ts";
// @ts-ignore -- untyped Minecraft Script API-independent offline fixture
import {createVerifiedLabExecutor} from "../minecraft/delivery-core-v2324-fixture/verified_executor.js";

process.env.NODE_ENV="test";
process.env.FIRESTORE_EMULATOR_HOST="127.0.0.1:8085";
delete process.env.VERCEL_ENV;
delete process.env.MERCADOPAGO_ACCESS_TOKEN;
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

const catalog=NETCRAFT_PREVIEW_VIP_APPROVALS.map(x=>({
  id:x.productId,name:NETCRAFT_VIP_TERMS[x.tier].name,
  duration:"30 dias",price:NETCRAFT_VIP_TERMS[x.tier].priceCents/100,
  active:true,
}));
const keyId="vip_lab",key="synthetic-offline-only-lab-key-1234567890";
let counter=0;
function fixture(tier:"explorer"|"elite"|"supreme",cost?:number){
  const p=NETCRAFT_PREVIEW_VIP_APPROVALS.find(x=>x.tier===tier)!;
  const id=crypto.createHash("sha256").update("NCBR-preview-"+tier).digest("hex");
  const price=cost??NETCRAFT_VIP_TERMS[tier].priceCents;
  const remote=ordersFixture(id,(price/100).toFixed(2),"approved");
  remote.live_mode=true;
  const db=memoryDB() as any;
  const order={id,environment:"commercial",catalogValidated:true,
    providerOrderId:remote.id,collector:"42",totalCents:price,
    currency:"BRL",gamertag:"Netcraft Tester",state:"pending",
    lines:[{productType:"vip",productId:p.productId,quantity:1,duration:"30 dias"}]};
  db.records.set("pixCommercialOrders/"+id,order);
  const reader={me:async()=>({id:42,netcraftTestAccount:false}),
    get:async()=>structuredClone(remote)};
  const now=Date.parse("2026-11-04T18:00:00Z");
  const svc=createNetCraftPreviewVipLabService(db,reader,{
    catalog,keyring:{[keyId]:key},now:()=>now});
  function send(action:BdsSignedMessage["action"],input:unknown){
    const body=JSON.stringify(input),timestamp=String(now);
    const nonce=(++counter).toString(16).padStart(32,"0");
    return svc.authenticatedRequest({action,body,headers:{keyId,timestamp,nonce,
      signature:bdsSignature(key,{action,body},timestamp,nonce,keyId)}},true);
  }
  return {db,id,svc,send,job:id+"-0"};
}
function core(tier:string){
  const receipts=new Map<string,string>(),grants:string[]=[];
  const player={name:"Netcraft Tester",id:"fixture-linked-account",isValid:true};
  const world={getAllPlayers:()=>[player],
    getDynamicProperty:(k:string)=>receipts.get(k),
    setDynamicProperty:(k:string,v:string)=>{receipts.set(k,v)}};
  const Server={VIPSystem:{
    vipRanks:new Map([["ncbr:vip_"+tier,{}]]),
    getVIP:()=>grants.length?{rankTag:grants[0]}:null,
    grantDeliveryVIPLab:(_n:string,rank:string,days:number)=>{
      assert.equal(days,30);grants.push(rank);return "applied";},
  }};
  const engine=()=>createVerifiedLabExecutor({world,Server,ItemStack:class {},
    isOfflineClone:()=>true,verifyLinkedPlayer:(p:any,j:any)=>
      p.id==="fixture-linked-account"&&p.name===j.gamertag});
  return {engine,grants,receipts};
}
test("Actual Preview IDs: mocked verified payment -> signed queue -> Core 2.3.24 VIP receipt and ACK",async()=>{
  for(const tier of ["explorer","elite","supreme"] as const){
    const f=fixture(tier),mc=core(tier);
    assert.equal((await f.svc.reconcileAndQueue(f.id)).created,1);
    assert.equal((await f.svc.reconcileAndQueue(f.id)).created,0);
    const poll=await f.send("poll",{gamertag:"Netcraft Tester",online:true}) as any;
    assert.equal(poll.dispatchEnabled,false);
    assert.equal(poll.deliveries.length,1);
    const offered=poll.deliveries[0];
    assert.equal(offered.payload.rankTag,"ncbr:vip_"+tier);
    assert.equal(offered.payload.days,30);
    assert.equal(mc.engine().execute(offered.payload).status,"applied");
    assert.equal(mc.engine().execute(offered.payload).status,"already_applied");
    assert.deepEqual(mc.grants,["ncbr:vip_"+tier]);
    assert.equal((await f.send("ack",{deliveryId:f.job,
      leaseToken:offered.leaseToken,result:"applied"}) as any).status,"acknowledged");
    assert.equal((await f.send("poll",{
      gamertag:"Netcraft Tester",online:true}) as any).deliveries.length,0);
    assert.equal(f.db.records.get("pixCommercialDeliveries/"+f.job).dispatchEnabled,false);
  }
});
test("Approved-looking payment with wrong VIP amount cannot enter delivery queue",async()=>{
  for(const tier of ["explorer","elite","supreme"] as const){
    const f=fixture(tier,1);
    await assert.rejects(()=>f.svc.reconcileAndQueue(f.id),/vip_order_amount_mismatch/);
    assert.equal(f.db.records.has("pixCommercialDeliveries/"+f.job),false);
  }
});
test("An order altered after queuing is refused on signed poll",async()=>{
  const f=fixture("supreme");
  await f.svc.reconcileAndQueue(f.id);
  f.db.records.get("pixCommercialOrders/"+f.id).totalCents=490;
  await assert.rejects(()=>f.send("poll",{
    gamertag:"Netcraft Tester",online:true}),/vip_order_amount_mismatch/);
  assert.equal(f.db.records.get("pixCommercialDeliveries/"+f.job).state,"queued");
});
test("Unapproved or bundled products cannot be converted into VIP jobs",async()=>{
  const f=fixture("elite");
  f.db.records.get("pixCommercialOrders/"+f.id).lines[0].productId="unapproved";
  await assert.rejects(()=>f.svc.reconcileAndQueue(f.id),/vip_product_not_approved/);
  const another=fixture("explorer");
  another.db.records.get("pixCommercialOrders/"+another.id).lines.push({
    ...another.db.records.get("pixCommercialOrders/"+another.id).lines[0]});
  await assert.rejects(()=>another.svc.reconcileAndQueue(another.id),/vip_single_plan_only/);
});
