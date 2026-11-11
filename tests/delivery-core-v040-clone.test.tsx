import {test} from "node:test";
import assert from "node:assert/strict";
import {makeRewardRegistry,mappedDelivery,registryDigest} from "../server/delivery/verifiedRewardRegistry.ts";
// @ts-ignore Script API independent BDS clone module does not have TS typings
import {createCoreDeliveryCloneEngine} from "../minecraft/delivery-core-v040-clone/core_delivery_engine.js";
const ORDER="c".repeat(64);
const catalog=makeRewardRegistry([
 {kind:"items",productId:"kit-verified",items:[
  {itemId:"minecraft:diamond",quantity:3},
  {itemId:"minecraft:iron_ingot",quantity:6},
 ]},
 ...(["explorer","elite","supreme"] as const).map(tier=>({
  kind:"vip" as const,productId:"store-"+tier,tier,
  rankTag:("ncbr:vip_"+tier) as "ncbr:vip_explorer"|"ncbr:vip_elite"|"ncbr:vip_supreme",
  duration:"30 dias" as const,days:30 as const,
 })),
]);
function environment(opts:{identity?:boolean;free?:number;online?:boolean;currentRank?:string}={}){
 const receipts=new Map<string,string>(),items:any[]=[];
 const player={id:"bedrock-linked-account-42",name:"Verified Player",isValid:true,
  getComponent:()=>({container:{
   isValid:true,get emptySlotsCount(){return (opts.free??40)-items.length;},
   addItem:(item:any)=>{items.push(item);return undefined;},
  }})};
 let grants=0,expiry=0,rank=opts.currentRank||"";
 const world={
  getAllPlayers:()=>opts.online===false?[]:[player],
  getDynamicProperty:(key:string)=>receipts.get(key),
  setDynamicProperty:(key:string,value:string)=>receipts.set(key,value),
 };
 class ItemStack {
  typeId:string;amount:number;maxAmount=64;
  constructor(id:string,amount:number){
   if(!["minecraft:diamond","minecraft:iron_ingot"].includes(id))throw Error("missing item");
   this.typeId=id;this.amount=amount;
  }
 }
 const Server={VIPSystem:{
  vipRanks:new Map(["explorer","elite","supreme"].map(x=>["ncbr:vip_"+x,{}])),
  getVIP:()=>rank?{rankTag:rank}:null,
  grantDeliveryVIPLab:(_name:string,newRank:string,days:number)=>{
   grants++;rank=newRank;expiry=Math.max(expiry,Date.now())+days*86_400_000;
   return "applied";
  },
 }};
 const newEngine=(verify=opts.identity!==false)=>createCoreDeliveryCloneEngine({
  world,ItemStack,Server,
  verifyLinkedPlayer:verify?((p:any,job:any)=>p.id==="bedrock-linked-account-42"&&
   p.name===job.gamertag):undefined,
 });
 const job=(productId:string,index:number,quantity=1)=>{
  const rule=catalog[productId];
  return mappedDelivery({
   orderId:ORDER,index,gamertag:"Verified Player",registry:catalog,
   line:rule.kind==="vip"?
    {productType:"vip",productId,quantity,duration:"30 dias"}:
    {productType:"product",productId,quantity,reward:{
      version:1,items:rule.items.map(x=>({...x})),
    }},
  });
 };
 return {newEngine,job,receipts,items,player,world,
  get grants(){return grants},get expiry(){return expiry},get rank(){return rank}};
}
test("25: kits use approved immutable mappings; forged items, quantities and IDs are denied",()=>{
 const x=environment();
 const kit=x.job("kit-verified",0,2);
 assert.equal(kit.kind,"items");
 if(kit.kind!=="items")throw Error("fixture expected an items payload");
 assert.deepEqual(kit.items,[
  {itemId:"minecraft:diamond",quantity:6},
  {itemId:"minecraft:iron_ingot",quantity:12},
 ]);
 assert.match(registryDigest(catalog),/^[a-f0-9]{64}$/);
 assert.throws(()=>makeRewardRegistry([{
  kind:"vip",productId:"rogue",tier:"supreme",rankTag:"admin",days:30,duration:"30 dias",
 }] as any),/unapproved_vip_rank_or_duration/);
 assert.throws(()=>mappedDelivery({
  orderId:ORDER,index:0,gamertag:"Verified Player",registry:catalog,
  line:{productType:"product",productId:"kit-verified",quantity:1,
   reward:{version:1,items:[{itemId:"minecraft:diamond",quantity:999}]}},
 }),/kit_snapshot_registry_mismatch/);
 assert.throws(()=>mappedDelivery({
  orderId:ORDER,index:0,gamertag:"Verified Player",registry:catalog,
  line:{productType:"product",productId:"not-in-registry",quantity:1,
   reward:{version:1,items:[]}},
 }),/unmapped_store_product/);
});
test("26: Explorer, Elite and Supreme grant once with exact 30-day registration",()=>{
 for(const [i,tier] of (["explorer","elite","supreme"] as const).entries()){
  const x=environment(),job=x.job("store-"+tier,i);
  assert.equal(job.kind,"vip");
  if(job.kind!=="vip")throw Error("fixture expected a VIP payload");
  assert.equal(job.rankTag,"ncbr:vip_"+tier);
  assert.equal(job.days,30);
  assert.equal(x.newEngine().execute(job).status,"applied");
  assert.equal(x.grants,1);
  assert.equal(x.rank,"ncbr:vip_"+tier);
  assert.ok(x.expiry>Date.now()+29*86_400_000);
  assert.equal(x.newEngine().execute(job).status,"already_applied");
  assert.equal(x.grants,1);
  const renewal=x.job("store-"+tier,i+10);
  const before=x.expiry;
  assert.equal(x.newEngine().execute(renewal).status,"applied");
  assert.equal(x.grants,2);
  assert.ok(x.expiry>=before+29*86_400_000);
 }
});
test("26: VIP upgrade/downgrade is held until original Core policy is explicitly approved",()=>{
 const x=environment({currentRank:"ncbr:vip_explorer"});
 assert.equal(x.newEngine().execute(x.job("store-supreme",0)).status,
  "vip_upgrade_review_required");
 assert.equal(x.grants,0);
 assert.equal(x.receipts.size,0);
});
test("27: correct player and verified account binding required before any receipt",()=>{
 const x=environment({identity:false}),kit=x.job("kit-verified",0);
 assert.equal(x.newEngine().execute(kit).status,"identity_unverified");
 assert.equal(x.items.length,0);
 assert.equal(x.receipts.size,0);
 const y=environment();
 assert.equal(y.newEngine().execute({...kit,gamertag:"Other Player"}).status,
  "player_offline");
 const z=environment({online:false});
 assert.equal(z.newEngine().execute(kit).status,"player_offline");
 assert.equal(y.newEngine().execute({...kit,id:ORDER+"-999",orderId:"a".repeat(64)}).status,
  "invalid_job");
 assert.equal(y.items.length,0);
});
test("24/28: cloned engine recovers receipts and never repeats partial/uncertain grants",()=>{
 const x=environment();
 const kit=x.job("kit-verified",0);
 assert.equal(x.newEngine().execute(kit).status,"applied");
 assert.equal(x.items.length,2);
 assert.equal(x.newEngine().execute(kit).status,"already_applied");
 assert.equal(x.items.length,2);
 const uncertain=x.job("kit-verified",1);
 x.receipts.set("ncbr:delivery_clone_v040:"+uncertain.id,
  JSON.stringify({state:"started"}));
 assert.equal(x.newEngine().execute(uncertain).status,"manual_review");
 assert.equal(x.items.length,2);
 const full=environment({free:0});
 assert.equal(full.newEngine().execute(kit).status,"inventory_full");
 assert.equal(full.receipts.size,0);
});
