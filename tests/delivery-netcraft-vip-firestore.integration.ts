// Real Firestore Emulator transactions + 3 real Preview VIP IDs + Core v2.3.24
// in-process executor. No MP network, live BDS, Cloudflare or Production.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {paymentDatabase} from "../server/payments/database.ts";
import {ordersFixture} from "./fixtures/pixOrders.ts";
import {createNetCraftPreviewVipLabService} from "../server/delivery/netcraftVipPreviewLabService.ts";
import {NETCRAFT_PREVIEW_VIP_APPROVALS} from "../server/delivery/netcraftVipPreviewApproval.ts";
import {NETCRAFT_VIP_TERMS} from "../server/delivery/netcraftVipCatalogApproval.ts";
// @ts-ignore Script API independent JS only
import {createVerifiedLabExecutor} from "../minecraft/delivery-core-v2324-fixture/verified_executor.js";

assert.equal(process.env.NODE_ENV,"test");
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,"127.0.0.1:8085");
assert.equal(process.env.MERCADOPAGO_ACCESS_TOKEN||"","");
assert.equal(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||"","");
assert.equal(process.env.VERCEL_ENV||"","");
const db=paymentDatabase();
const catalog=NETCRAFT_PREVIEW_VIP_APPROVALS.map(x=>({
  id:x.productId,name:NETCRAFT_VIP_TERMS[x.tier].name,
  price:NETCRAFT_VIP_TERMS[x.tier].priceCents/100,
  duration:"30 dias",active:true,
}));
const remoteById=new Map<string,any>();
const reader={
  me:async()=>({id:42,netcraftTestAccount:false}),
  get:async(id:string)=>{
    if(!remoteById.has(id))throw Error("missing_fixture");
    return structuredClone(remoteById.get(id));
  },
};
const service=()=>createNetCraftPreviewVipLabService(db,reader,{
  catalog,keyring:{emulator_only:"synthetic-local-key-is-not-secret-123456789"},
});
function engine(playerName:string,tier:string){
  const receipts=new Map<string,string>(),grants:string[]=[];
  const player={name:playerName,id:"linked-firestore-fixture",isValid:true};
  const world={getAllPlayers:()=>[player],
    getDynamicProperty:(key:string)=>receipts.get(key),
    setDynamicProperty:(key:string,value:string)=>{receipts.set(key,value)}};
  const Server={VIPSystem:{
    vipRanks:new Map([["ncbr:vip_"+tier,{}]]),
    getVIP:()=>grants.length?{rankTag:grants[0]}:null,
    grantDeliveryVIPLab:(_n:string,rank:string,days:number)=>{
      assert.equal(days,30);grants.push(rank);return "applied";
    },
  }};
  const boot=()=>createVerifiedLabExecutor({world,Server,ItemStack:class {},
    isOfflineClone:()=>true,verifyLinkedPlayer:(p:any,j:any)=>
      p.name===j.gamertag&&p.id==="linked-firestore-fixture"});
  return {boot,grants};
}
async function order(tier:"explorer"|"elite"|"supreme",cents:number){
  const id=crypto.createHash("sha256").update("NCBR-VIP-firestore-"+tier+"-"+cents).digest("hex");
  const productId=NETCRAFT_PREVIEW_VIP_APPROVALS.find(x=>x.tier===tier)!.productId;
  const remote=ordersFixture(id,(cents/100).toFixed(2),"approved");
  remote.live_mode=true;
  remote.id="ORD"+id.slice(0,27).toUpperCase();
  remote.transactions.payments[0].id="PAY"+id.slice(0,27).toUpperCase();
  remoteById.set(remote.id,remote);
  await db.doc("pixCommercialOrders/"+id).set({
    id,environment:"commercial",catalogValidated:true,providerOrderId:remote.id,
    collector:"42",totalCents:cents,currency:"BRL",state:"pending",
    gamertag:"Preview Tester",
    lines:[{productType:"vip",productId,quantity:1,duration:"30 dias"}],
  });
  return {id,deliveryId:id+"-0"};
}
try {
  for(const tier of ["explorer","elite","supreme"] as const){
    const {id,deliveryId}=await order(tier,NETCRAFT_VIP_TERMS[tier].priceCents);
    assert.equal((await service().reconcileAndQueue(id)).created,1);
    assert.equal((await service().reconcileAndQueue(id)).created,0);
    const offers=await Promise.all([
      service().offer(deliveryId,"Preview Tester",true),
      service().offer(deliveryId,"Preview Tester",true),
    ]);
    const won=offers.filter((x:any)=>x.status==="offered") as any[];
    assert.equal(won.length,1,"Firestore transaction permits one lease");
    const mc=engine("Preview Tester",tier);
    assert.equal(won[0].payload.rankTag,"ncbr:vip_"+tier);
    assert.equal(mc.boot().execute(won[0].payload).status,"applied");
    assert.equal(mc.boot().execute(won[0].payload).status,"already_applied");
    assert.equal(mc.grants.length,1);
    assert.equal((await service().acknowledge(
      deliveryId,won[0].leaseToken,"applied")).status,"acknowledged");
    assert.equal((await service().offer(deliveryId,"Preview Tester",true)).status,"held");
    const snap=(await db.doc("pixCommercialDeliveries/"+deliveryId).get()).data();
    assert.equal(snap?.dispatchEnabled,false);
    assert.equal(snap?.attempts,1);
  }
  const bad=await order("supreme",1);
  await assert.rejects(()=>service().reconcileAndQueue(bad.id),
    /vip_order_amount_mismatch/);
  assert.equal((await db.doc("pixCommercialDeliveries/"+bad.deliveryId).get()).exists,false);
  console.log("PASS NetCraftBR 3 VIP IDs: Firestore Emulator queue + Core 2.3.24 mock receipt, atomic lease, no doubles, bad price refused; COMMERCIAL OFF");
} finally {
  await db.terminate();
}
