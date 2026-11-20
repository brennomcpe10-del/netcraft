// Gate 29 — REAL local Firestore transaction integration against a simulated
// Bedrock Core world. Executes only in the disposable Firebase emulator.
// Never contacts Mercado Pago, a real BDS, or the public checkout.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {paymentDatabase} from "../server/payments/database.ts";
import {ordersFixture} from "./fixtures/pixOrders.ts";
import {createCommercialStagingService} from "../server/delivery/commercialStagingService.ts";
import {makeRewardRegistry} from "../server/delivery/verifiedRewardRegistry.ts";
// @ts-ignore isolated Bedrock JavaScript clone adapter without TS declarations
import {createCoreDeliveryCloneEngine} from "../minecraft/delivery-core-v040-clone/core_delivery_engine.js";

assert.equal(process.env.NODE_ENV,"test");
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,"127.0.0.1:8085");
assert.equal(process.env.MERCADOPAGO_ACCESS_TOKEN || "","");
assert.equal(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "","");
assert.equal(process.env.VERCEL_ENV || "","");
const db=paymentDatabase();
const registry=makeRewardRegistry([
 {kind:"items",productId:"gate29-kit",items:[
  {itemId:"minecraft:diamond",quantity:3},
  {itemId:"minecraft:iron_ingot",quantity:6},
 ]},
 ...(["explorer","elite","supreme"] as const).map(tier=>({
  kind:"vip" as const,productId:"gate29-vip-"+tier,tier,
  rankTag:("ncbr:vip_"+tier) as
    "ncbr:vip_explorer"|"ncbr:vip_elite"|"ncbr:vip_supreme",
  duration:"30 dias" as const,days:30 as const,
 })),
]);
let now=Date.now();
const resources=new Map<string,any>();
const reader={
 me:async()=>({id:42,netcraftTestAccount:false}),
 get:async(providerId:string)=>{
  const resource=resources.get(providerId);
  if(!resource)throw Error("unknown_fixture_order");
  return structuredClone(resource);
 },
};
const service=()=>createCommercialStagingService(db,reader,{
 registry,keyring:{gate29_server:"synthetic-emulator-key-for-test-only-1234567890"},
 now:()=>now,
});
type Line=Record<string,unknown>;
const kit:Line={productType:"product",productId:"gate29-kit",quantity:1,
 reward:{version:1,items:[
  {itemId:"minecraft:diamond",quantity:3},
  {itemId:"minecraft:iron_ingot",quantity:6},
 ]}};
const vip=(tier:string):Line=>({productType:"vip",
 productId:"gate29-vip-"+tier,quantity:1,duration:"30 dias"});
async function order(label:string,lines:Line[],gamertag:string){
 const id=crypto.createHash("sha256").update("gate29-firestore:"+label).digest("hex");
 const suffix=id.slice(0,26).toUpperCase();
 const remote=ordersFixture(id,"25.00","approved");
 remote.id="ORD"+suffix;
 remote.transactions.payments[0].id="PAY"+suffix;
 remote.live_mode=true;
 resources.set(remote.id,remote);
 await db.doc("pixCommercialOrders/"+id).set({
  id,environment:"commercial",catalogValidated:true,
  providerOrderId:remote.id,collector:"42",totalCents:2500,
  currency:"BRL",gamertag,lines,state:"pending",
 });
 return {id,remote,gamertag,job:(i:number)=>id+"-"+i};
}
function clone(gamertag:string){
 const receipts=new Map<string,string>(),stacks:any[]=[];
 const grants:{rankTag:string,days:number}[]=[];
 let rank="",expiry=0,online=true,freeSlots=20;
 const player={id:"linked-emulator-account-29",name:gamertag,isValid:true,
  getComponent:()=>({container:{
   isValid:true,get emptySlotsCount(){return freeSlots-stacks.length;},
   addItem:(item:any)=>{stacks.push(item);return undefined;},
  }})};
 const world={
  getAllPlayers:()=>online?[player]:[],
  getDynamicProperty:(key:string)=>receipts.get(key),
  setDynamicProperty:(key:string,value:string)=>receipts.set(key,value),
 };
 class ItemStack {
  typeId:string;amount:number;maxAmount=64;
  constructor(typeId:string,amount:number){
   if(!["minecraft:diamond","minecraft:iron_ingot"].includes(typeId))
    throw Error("invalid_synthetic_item");
   this.typeId=typeId;this.amount=amount;
  }
 }
 const Server={VIPSystem:{
  vipRanks:new Map(["explorer","elite","supreme"].map(x=>["ncbr:vip_"+x,{}])),
  getVIP:()=>rank?{rankTag:rank}:null,
  grantDeliveryVIPLab:(_name:string,rankTag:string,days:number)=>{
   grants.push({rankTag,days});rank=rankTag;
   expiry=Math.max(expiry,Date.now())+days*86_400_000;
   return "applied";
  },
 }};
 const engine=()=>createCoreDeliveryCloneEngine({
  world,ItemStack,Server,
  verifyLinkedPlayer:(p:any,j:any)=>p.id==="linked-emulator-account-29"&&
   p.name===j.gamertag,
 });
 return {engine,receipts,stacks,grants,
  offline:()=>{online=false},online:()=>{online=true},
  full:()=>{freeSlots=0},free:()=>{freeSlots=20},
  get expiry(){return expiry},
 };
}
const ensureOne=async(id:string,player:string)=>{
 const offered=await Promise.all([
  service().offer(id,player,true),service().offer(id,player,true),
 ]);
 const winners=offered.filter((x:any)=>x.status==="offered");
 assert.equal(winners.length,1,"only one Firestore transaction may lease a delivery");
 return winners[0] as any;
};
try{
 // 1) Multi-line order: kit + VIP Explorer, actual Firestore queue/lease and
 // simulated Core item + entitlement. Repeated offer/ACK never duplicates.
 const first=await order("bundle-explorer",[kit,vip("explorer")],"Emulator Player");
 const world=clone(first.gamertag);
 assert.equal((await service().reconcileAndQueue(first.id)).created,2);
 assert.equal((await service().reconcileAndQueue(first.id)).created,0);
 assert.equal((await service().offer(first.job(0),first.gamertag,false)).status,"offline");
 const itemOffer=await ensureOne(first.job(0),first.gamertag);
 assert.equal(itemOffer.dispatchEnabled,false);
 assert.equal(itemOffer.payload.kind,"items");
 assert.equal(world.engine().execute(itemOffer.payload).status,"applied");
 assert.equal(world.engine().execute(itemOffer.payload).status,"already_applied");
 assert.equal(world.stacks.length,2);
 assert.equal((await service().acknowledge(first.job(0),itemOffer.leaseToken,"applied")).status,
  "acknowledged");
 assert.equal((await service().acknowledge(first.job(0),itemOffer.leaseToken,"already_applied") as any)
  .duplicate,true);
 const vipOffer=await ensureOne(first.job(1),first.gamertag);
 assert.equal(world.engine().execute(vipOffer.payload).status,"applied");
 assert.equal(world.grants.length,1);
 assert.equal(world.grants[0].rankTag,"ncbr:vip_explorer");
 assert.equal(world.grants[0].days,30);
 assert.ok(world.expiry>Date.now()+29*86_400_000);
 await service().acknowledge(first.job(1),vipOffer.leaseToken,"applied");
 assert.equal(world.engine().execute(vipOffer.payload).status,"already_applied");
 assert.equal(world.grants.length,1);
 // 2) Distinct 30-day Elite/Supreme payments: no cross-player reward
 // or duplicate delivery across service/engine restart.
 for(const tier of ["elite","supreme"]){
  const individual=await order("tier-"+tier,[vip(tier)],"Player "+tier);
  const anotherWorld=clone(individual.gamertag);
  assert.equal((await service().reconcileAndQueue(individual.id)).created,1);
  const off=await ensureOne(individual.job(0),individual.gamertag);
  assert.equal(off.payload.rankTag,"ncbr:vip_"+tier);
  assert.equal(anotherWorld.engine().execute(off.payload).status,"applied");
  assert.equal(anotherWorld.engine().execute(off.payload).status,"already_applied");
  assert.equal(anotherWorld.grants.length,1);
  assert.equal((await service().acknowledge(individual.job(0),off.leaseToken,"applied")).status,
   "acknowledged");
  assert.equal((await service().offer(individual.job(0),individual.gamertag,true)).status,
   "held");
 }
 // 3) Drop after Core grant but BEFORE ACK: real Firestore lease never
 // auto-reissues; Core persisted receipt and original ACK finalize safely.
 const lost=await order("lost-ack",[kit],"Lost Player");
 const lostWorld=clone(lost.gamertag);
 await service().reconcileAndQueue(lost.id);
 const lostOffer=await ensureOne(lost.job(0),lost.gamertag);
 assert.equal(lostWorld.engine().execute(lostOffer.payload).status,"applied");
 now+=121_000;
 assert.equal((await service().recoverAfterRestart(100)).awaitingReceipt,1);
 assert.equal((await service().diagnose(lost.job(0))).state,"awaiting_receipt");
 assert.equal((await service().offer(lost.job(0),lost.gamertag,true)).status,"held");
 assert.equal(lostWorld.engine().execute(lostOffer.payload).status,"already_applied");
 assert.equal(lostWorld.stacks.length,2);
 assert.equal((await service().acknowledge(lost.job(0),lostOffer.leaseToken,"already_applied"))
  .status,"acknowledged");
 assert.equal((await service().acknowledge(lost.job(0),lostOffer.leaseToken,"already_applied") as any)
  .duplicate,true);
 assert.equal((await db.doc("pixCommercialDeliveries/"+lost.job(0)).get()).data()?.attempts,1);
 // 4) Offline/full inventory: only pre-receipt NACK is retryable; expired
 // retries need another provider GET and cannot create a new reward ID.
 const held=await order("full-inventory",[kit],"Full Player");
 const fullWorld=clone(held.gamertag);
 await service().reconcileAndQueue(held.id);
 fullWorld.full();
 const before=await ensureOne(held.job(0),held.gamertag);
 assert.equal(fullWorld.engine().execute(before.payload).status,"inventory_full");
 assert.equal(fullWorld.engine().receiptStatus(before.payload.id),"none");
 assert.equal((await service().nack(held.job(0),before.leaseToken,
  "inventory_full","none")).status,"retryable");
 now+=5001;
 const after=await ensureOne(held.job(0),held.gamertag);
 assert.notEqual(before.leaseToken,after.leaseToken);
 assert.equal((await service().acknowledge(held.job(0),before.leaseToken,"applied")).status,
  "held");
 fullWorld.free();
 assert.equal(fullWorld.engine().execute(after.payload).status,"applied");
 await service().acknowledge(held.job(0),after.leaseToken,"applied");
 assert.equal(fullWorld.engine().execute(after.payload).status,"already_applied");
 assert.equal(fullWorld.stacks.length,2);
 // Every queued job was explicitly OFF. No public dispatch route or worker.
 for(const target of [first.job(0),first.job(1),lost.job(0),held.job(0)]){
  const snap=await db.doc("pixCommercialDeliveries/"+target).get();
  assert.equal(snap.data()?.dispatchEnabled,false);
 }
 console.log("PASS GATE29 Firestore+BDS clone: bundle kit/Explorer, Elite/Supreme, concurrent lease, offline/full inventory, lost ACK/reconnect, zero duplicate receipts, NO live dispatch");
}finally{
 await db.terminate();
}
