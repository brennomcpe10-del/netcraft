// Gate 29: in-process BDS clone + private signed service + simulated Orders GET.
// Never connects to BDS/MagnoHost/MP; Firestore emulator equivalent runs separately.
import {test} from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {memoryDB,ordersFixture} from "./fixtures/pixOrders.ts";
import {createCommercialStagingService} from "../server/delivery/commercialStagingService.ts";
import {makeRewardRegistry} from "../server/delivery/verifiedRewardRegistry.ts";
import {bdsSignature,BdsAuthError,type BdsSignedMessage} from "../server/delivery/bdsSignedRequest.ts";
// @ts-ignore Script API-independent library intentionally has no TS types.
import {createCoreDeliveryCloneEngine} from "../minecraft/delivery-core-v040-clone/core_delivery_engine.js";

process.env.NODE_ENV="test";
process.env.FIRESTORE_EMULATOR_HOST="127.0.0.1:8085";
delete process.env.VERCEL_ENV;
delete process.env.MERCADOPAGO_ACCESS_TOKEN;
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const keyId="clone_gate29", secret="synthetic-bds-hmac-key-for-gate29-123456789";
const registry=makeRewardRegistry([
 {kind:"items",productId:"kit-lab",items:[
  {itemId:"minecraft:diamond",quantity:3},{itemId:"minecraft:iron_ingot",quantity:6},
 ]},
 ...(["explorer","elite","supreme"] as const).map(tier=>({
  kind:"vip" as const,productId:"vip-"+tier,tier,
  rankTag:("ncbr:vip_"+tier) as "ncbr:vip_explorer"|"ncbr:vip_elite"|"ncbr:vip_supreme",
  days:30 as const,duration:"30 dias" as const,
 })),
]);
type Line={productType:string;productId:string;quantity:number;duration?:string;
 reward?:{version:number;items:{itemId:string;quantity:number}[]}};
const kit=(quantity=1):Line=>({productType:"product",productId:"kit-lab",
 quantity,reward:{version:1,items:[{itemId:"minecraft:diamond",quantity:3},
  {itemId:"minecraft:iron_ingot",quantity:6}]}});
const vip=(tier:"explorer"|"elite"|"supreme"):Line=>({
 productType:"vip",productId:"vip-"+tier,quantity:1,duration:"30 dias",
});
const orderId=(label:string)=>crypto.createHash("sha256")
 .update("gate29:"+label).digest("hex");

function laboratory(label:string,lines:Line[],gamertag="Netcraft Tester") {
 const id=orderId(label);
 const db=memoryDB() as any;
 // Serialize fake transactions. Real distributed atomic transactions are
 // tested in the dedicated Firestore Emulator Gate 29 script.
 const original=db.runTransaction;
 let last:Promise<unknown>=Promise.resolve();
 db.runTransaction=(fn:any)=>{
  const current=last;
  let release!:()=>void;
  last=new Promise<void>(r=>{release=r});
  return current.then(()=>original(fn)).finally(release);
 };
 let time=Date.parse("2026-11-02T15:00:00Z");
 const remote=ordersFixture(id,"25.00","approved");
 remote.live_mode=true;
 db.records.set("pixCommercialOrders/"+id,{
  id,environment:"commercial",catalogValidated:true,
  providerOrderId:remote.id,collector:"42",totalCents:2500,currency:"BRL",
  state:"pending",gamertag,lines,
 });
 const reader={
  me:async()=>({id:42,netcraftTestAccount:false}),
  get:async()=>structuredClone(remote),
 };
 const service=()=>createCommercialStagingService(db,reader,{
  keyring:{[keyId]:secret},registry,now:()=>time,
 });
 let counter=0;
 function signed(action:BdsSignedMessage["action"],body:unknown):BdsSignedMessage{
  const payload=JSON.stringify(body),timestamp=String(time);
  const nonce=(++counter).toString(16).padStart(32,"0");
  return {action,body:payload,headers:{keyId,timestamp,nonce,
   signature:bdsSignature(secret,{action,body:payload},timestamp,nonce,keyId)}};
 }
 const send=(action:BdsSignedMessage["action"],body:unknown)=>
  service().authenticatedRequest(signed(action,body),true);
 const advance=(milliseconds:number)=>{time+=milliseconds;};
 const queue=(index:number)=>db.records.get("pixCommercialDeliveries/"+id+"-"+index);
 const countJobs=()=>[...db.records.keys()].filter((p:string)=>
  p.startsWith("pixCommercialDeliveries/")).length;
 return {id,db,remote,reader,service,send,signed,advance,queue,countJobs,
  gamertag};
}

function minecraftClone(name="Netcraft Tester",opts:{identity?:boolean;online?:boolean;
 freeSlots?:number;throwOnStack?:number;existingTier?:string}={}) {
 const props=new Map<string,string>(),items:any[]=[];
 const appliedVips:{rank:string;days:number}[]=[];
 const player={name,isValid:true,id:"account-linked-gate29",
  getComponent:()=>({container:{
   isValid:true,
   get emptySlotsCount(){return (opts.freeSlots??36)-items.length;},
   addItem:(item:any)=>{
    if(opts.throwOnStack===items.length+1)throw Error("simulated_inventory_failure");
    items.push(item);
    return undefined;
   },
  }})};
 let active=opts.existingTier||"",expiry=0;
 const world={
  getAllPlayers:()=>opts.online===false?[]:[player],
  getDynamicProperty:(key:string)=>props.get(key),
  setDynamicProperty:(key:string,value:string)=>props.set(key,value),
 };
 class ItemStack{
  typeId:string;amount:number;maxAmount=64;
  constructor(typeId:string,amount:number){
   if(!["minecraft:diamond","minecraft:iron_ingot"].includes(typeId))
    throw Error("unavailable_item");
   this.typeId=typeId;this.amount=amount;
  }
 }
 const core={VIPSystem:{
  vipRanks:new Map(["explorer","elite","supreme"].map(t=>["ncbr:vip_"+t,{}])),
  getVIP:()=>active?{rankTag:active}:null,
  grantDeliveryVIPLab:(_name:string,rank:string,days:number)=>{
   appliedVips.push({rank,days});
   active=rank;
   expiry=Math.max(expiry,Date.now())+days*86_400_000;
   return "applied";
  },
 }};
 const reboot=()=>createCoreDeliveryCloneEngine({
  world,ItemStack,Server:core,
  verifyLinkedPlayer:(p:any,job:any)=>opts.identity!==false &&
    p.id==="account-linked-gate29" && p.name===job.gamertag,
 });
 return {reboot,items,appliedVips,props,
  get active(){return active},get expiry(){return expiry}};
}

async function oneOffer(lab:ReturnType<typeof laboratory>) {
 const poll=await lab.send("poll",{gamertag:lab.gamertag,online:true}) as any;
 assert.equal(poll.dispatchEnabled,false);
 assert.equal(poll.simulation,true);
 assert.equal(poll.deliveries.length,1);
 const offer=poll.deliveries[0];
 assert.equal(offer.status,"offered");
 assert.equal(offer.dispatchEnabled,false);
 return offer as {payload:any;leaseToken:string};
}
async function acknowledge(lab:ReturnType<typeof laboratory>,offer:{
 payload:any;leaseToken:string},result="applied") {
 return lab.send("ack",{deliveryId:offer.payload.id,
  leaseToken:offer.leaseToken,result}) as Promise<any>;
}

test("29 KIT: approved mock Pix -> durable outbox -> signed poll -> cloned Core -> ACK; reconnect never duplicates",async()=>{
 const lab=laboratory("kit-happy",[kit()]),mc=minecraftClone();
 assert.deepEqual(await lab.service().reconcileAndQueue(lab.id),{
  state:"approved",created:1,dispatchEnabled:false,
 });
 assert.equal((await lab.service().reconcileAndQueue(lab.id)).created,0);
 assert.equal(lab.countJobs(),1);
 const offered=await oneOffer(lab);
 assert.equal(offered.payload.kind,"items");
 assert.deepEqual(offered.payload.items,[
  {itemId:"minecraft:diamond",quantity:3},
  {itemId:"minecraft:iron_ingot",quantity:6},
 ]);
 assert.equal(mc.reboot().execute(offered.payload).status,"applied");
 assert.equal(mc.items.length,2);
 assert.equal(mc.items.reduce((sum,x)=>sum+x.amount,0),9);
 const ack=await acknowledge(lab,offered);
 assert.equal(ack.status,"acknowledged");
 assert.equal((await acknowledge(lab,offered,"already_applied")).duplicate,true);
 assert.equal(mc.reboot().execute(offered.payload).status,"already_applied");
 assert.equal(mc.items.length,2);
 assert.equal(lab.queue(0).attempts,1);
 assert.equal((await lab.send("poll",{
  gamertag:lab.gamertag,online:true}) as any).deliveries.length,0);
 assert.equal(lab.queue(0).dispatchEnabled,false);
});

test("29 VIP: each tier grants once, preserves 30-day entitlement and renews ONLY with another approved order",async()=>{
 for(const tier of ["explorer","elite","supreme"] as const){
  const lab=laboratory("vip-"+tier+"-initial",[vip(tier)]);
  const mc=minecraftClone();
  await lab.service().reconcileAndQueue(lab.id);
  const offer=await oneOffer(lab);
  assert.equal(offer.payload.rankTag,"ncbr:vip_"+tier);
  assert.equal(offer.payload.days,30);
  assert.equal(mc.reboot().execute(offer.payload).status,"applied");
  assert.equal(mc.appliedVips.length,1);
  const before=mc.expiry;
  assert.ok(before>Date.now()+29*86_400_000);
  await acknowledge(lab,offer);
  assert.equal(mc.reboot().execute(offer.payload).status,"already_applied");
  assert.equal(mc.appliedVips.length,1);
  const renewal=laboratory("vip-"+tier+"-renewal",[vip(tier)]);
  await renewal.service().reconcileAndQueue(renewal.id);
  const renewed=await oneOffer(renewal);
  assert.notEqual(renewed.payload.id,offer.payload.id);
  assert.equal(mc.reboot().execute(renewed.payload).status,"applied");
  assert.equal(mc.appliedVips.length,2);
  assert.ok(mc.expiry>=before+29*86_400_000);
  await acknowledge(renewal,renewed);
  assert.equal((await acknowledge(renewal,renewed)).duplicate,true);
 }
});

test("29 LOSS OF ACK: after Core grants kit, disconnect and restart both sides; late signed ACK is accepted without regrant",async()=>{
 const lab=laboratory("kit-ack-lost",[kit()]),mc=minecraftClone();
 await lab.service().reconcileAndQueue(lab.id);
 const offered=await oneOffer(lab);
 assert.equal(mc.reboot().execute(offered.payload).status,"applied");
 assert.equal(mc.items.length,2);
 // Transport is dropped BEFORE ACK; backend only knows the leased state.
 lab.advance(121_000);
 const restored=lab.service();
 assert.equal((await restored.recoverAfterRestart()).awaitingReceipt,1);
 assert.equal((await restored.diagnose(offered.payload.id)).state,"awaiting_receipt");
 assert.equal((await lab.send("poll",{
  gamertag:lab.gamertag,online:true}) as any).deliveries.length,0);
 // BDS restart reads persistent world receipt and refuses to regrant.
 assert.equal(mc.reboot().receiptStatus(offered.payload.id),"applied");
 assert.equal(mc.reboot().execute(offered.payload).status,"already_applied");
 assert.equal(mc.items.length,2);
 const ack=await acknowledge(lab,offered,"already_applied");
 assert.equal(ack.status,"acknowledged");
 assert.equal((await acknowledge(lab,offered,"already_applied")).duplicate,true);
 assert.equal(lab.queue(0).attempts,1);
});

test("29 OFFLINE/FULL INVENTORY: no early receipt; signed safe NACK allows later reconnect only once",async()=>{
 const lab=laboratory("kit-offline-full",[kit()]);
 await lab.service().reconcileAndQueue(lab.id);
 assert.deepEqual((await lab.send("poll",{
  gamertag:lab.gamertag,online:false}) as any).deliveries,[]);
 assert.equal(lab.queue(0).state,"queued");
 const mc=minecraftClone(undefined,{freeSlots:0});
 const first=await oneOffer(lab);
 assert.equal(mc.reboot().execute(first.payload).status,"inventory_full");
 assert.equal(mc.reboot().receiptStatus(first.payload.id),"none");
 assert.equal((await lab.send("nack",{
  deliveryId:first.payload.id,leaseToken:first.leaseToken,
  reason:"inventory_full",receipt:"none"}) as any).status,"retryable");
 assert.equal((await lab.send("poll",{
  gamertag:lab.gamertag,online:true}) as any).deliveries.length,0);
 lab.advance(5_001);
 const second=await oneOffer(lab);
 assert.notEqual(second.leaseToken,first.leaseToken);
 assert.equal((await acknowledge(lab,first)).status,"held");
 const reconnect=minecraftClone();
 assert.equal(reconnect.reboot().execute(second.payload).status,"applied");
 await acknowledge(lab,second);
 assert.equal(reconnect.reboot().execute(second.payload).status,"already_applied");
 assert.equal(reconnect.items.length,2);
 assert.equal(lab.queue(0).attempts,2);
});

test("29 PARTIAL WRITE/UNKNOWN RECEIPT: quarantine on reconnect; absolutely no blind retry",async()=>{
 const lab=laboratory("kit-partial",[kit()]),mc=minecraftClone(undefined,{throwOnStack:2});
 await lab.service().reconcileAndQueue(lab.id);
 const offered=await oneOffer(lab);
 assert.equal(mc.reboot().execute(offered.payload).status,"manual_review");
 assert.equal(mc.items.length,1);
 assert.equal(mc.reboot().receiptStatus(offered.payload.id),"started");
 assert.equal(mc.reboot().execute(offered.payload).status,"manual_review");
 assert.equal(mc.items.length,1);
 assert.equal((await lab.send("nack",{
  deliveryId:offered.payload.id,leaseToken:offered.leaseToken,
  reason:"inventory_full",receipt:"started"}) as any).status,"review_required");
 lab.advance(200_000);
 assert.equal((await lab.service().recoverAfterRestart()).awaitingReceipt,0);
 assert.equal((await lab.send("poll",{
  gamertag:lab.gamertag,online:true}) as any).deliveries.length,0);
 assert.equal(lab.queue(0).state,"review_required");
});

test("29 WRONG PLAYER and forged BDS signature: no Core receipt, no ACK or grant",async()=>{
 const lab=laboratory("wrong-player",[vip("supreme")]),mc=minecraftClone(undefined,{identity:false});
 await lab.service().reconcileAndQueue(lab.id);
 const invalidPoll=lab.signed("poll",{gamertag:lab.gamertag,online:true});
 invalidPoll.headers.signature="0".repeat(64);
 await assert.rejects(()=>lab.service().authenticatedRequest(invalidPoll,true),
  (e:any)=>e instanceof BdsAuthError && e.code==="unauthorized");
 assert.equal(lab.queue(0).state,"queued");
 const offered=await oneOffer(lab);
 assert.equal(mc.reboot().execute(offered.payload).status,"identity_unverified");
 assert.equal(mc.appliedVips.length,0);
 assert.equal(mc.props.size,0);
 assert.equal((await lab.send("nack",{
  deliveryId:offered.payload.id,leaseToken:offered.leaseToken,
  reason:"identity_unverified",receipt:"none"}) as any).status,"review_required");
 assert.equal(lab.queue(0).state,"review_required");
});

test("29 DISPUTE/REFUND: stale order cannot grant items or VIP on reconnect",async()=>{
 const lab=laboratory("refund-kit",[kit(),vip("explorer")]);
 await lab.service().reconcileAndQueue(lab.id);
 // Mock a provider dispute before the first poll.
 lab.remote.status="in_mediation";
 lab.remote.status_detail="in_mediation";
 lab.remote.transactions.payments[0].status="in_mediation";
 lab.remote.transactions.payments[0].status_detail="in_mediation";
 assert.equal((await lab.service().reconcileAndQueue(lab.id)).state,"disputed");
 assert.equal(lab.queue(0).state,"blocked");
 assert.equal(lab.queue(1).state,"blocked");
 assert.equal((await lab.send("poll",{
  gamertag:lab.gamertag,online:true}) as any).deliveries.length,0);
 assert.equal(lab.countJobs(),2);
 assert.equal(lab.queue(0).dispatchEnabled,false);
 assert.equal(lab.queue(1).dispatchEnabled,false);
});

test("29 CONCURRENT POLL: same persistent delivery has one lease, one ACK and never two grants",async()=>{
 const lab=laboratory("concurrent-poll",[kit()]),mc=minecraftClone();
 await lab.service().reconcileAndQueue(lab.id);
 const [a,b]=await Promise.all([
  lab.send("poll",{gamertag:lab.gamertag,online:true}),
  lab.send("poll",{gamertag:lab.gamertag,online:true}),
 ]) as any[];
 const offered=[...a.deliveries,...b.deliveries];
 assert.equal(offered.length,1);
 assert.equal(mc.reboot().execute(offered[0].payload).status,"applied");
 assert.equal(mc.reboot().execute(offered[0].payload).status,"already_applied");
 assert.equal((await acknowledge(lab,offered[0])).status,"acknowledged");
 assert.equal(mc.items.length,2);
 assert.equal(lab.queue(0).attempts,1);
});
