import {test} from "node:test";
import assert from "node:assert/strict";
import {
  approvedNetCraftVipRegistry, NETCRAFT_VIP_TERMS,
  type ApprovedVipId, type CatalogVipForApproval,
} from "../server/delivery/netcraftVipCatalogApproval.ts";
import {mappedDelivery} from "../server/delivery/verifiedRewardRegistry.ts";

const approval: ApprovedVipId[] = [
  {tier:"explorer",productId:"vip-approval-EX1"},
  {tier:"elite",productId:"vip-approval-EL2"},
  {tier:"supreme",productId:"vip-approval-SU3"},
];
const records: CatalogVipForApproval[] = approval.map(x=>({
  id:x.productId,
  name:NETCRAFT_VIP_TERMS[x.tier].name,
  price:NETCRAFT_VIP_TERMS[x.tier].priceCents/100,
  duration:"30 dias",
  active:true,
}));
const alter=(tier:"explorer"|"elite"|"supreme", changes:Partial<CatalogVipForApproval>)=>
  records.map(r=>r.id===approval.find(x=>x.tier===tier)!.productId
    ?{...r,...changes}:r);
const ORDER="a".repeat(64);
test("Explicit server-approved IDs map the three existing VIPs to Core ranks",()=>{
  const registry=approvedNetCraftVipRegistry(records,approval);
  assert.equal(Object.keys(registry).length,3);
  for(let index=0;index<approval.length;index++){
    const {productId,tier}=approval[index];
    const job=mappedDelivery({orderId:ORDER,index,gamertag:"Halzin5212",
      line:{productType:"vip",productId,quantity:1,duration:"30 dias"},
      registry});
    assert.deepEqual({
      kind:job.kind,rankTag:job.kind==="vip"?job.rankTag:null,
      days:job.kind==="vip"?job.days:null,
    },{kind:"vip",rankTag:NETCRAFT_VIP_TERMS[tier].rankTag,days:30});
  }
});
test("Observed prices and duration from NetCraftBR do not authorize unknown product IDs",()=>{
  assert.throws(()=>approvedNetCraftVipRegistry(records,[]),/vip_approval_incomplete/);
  assert.throws(()=>approvedNetCraftVipRegistry(records,[
    {...approval[0],productId:"vip-guessed-id"},...approval.slice(1)]),
    /vip_catalog_terms_mismatch/);
  const registry=approvedNetCraftVipRegistry(records,approval);
  assert.throws(()=>mappedDelivery({orderId:ORDER,index:0,gamertag:"Halzin5212",
    line:{productType:"vip",productId:"vip-guessed-id",quantity:1,duration:"30 dias"},
    registry}),/unmapped_store_product/);
});
test("Changing the amount of any VIP fails approval before a reward is authorized",()=>{
  for(const tier of ["explorer","elite","supreme"] as const) {
    const id=approval.find(x=>x.tier===tier)!.productId;
    for(const price of [0,-1,0.01,NaN,Infinity,NETCRAFT_VIP_TERMS[tier].priceCents/100+0.01]){
      assert.throws(()=>approvedNetCraftVipRegistry(alter(tier,{price}),approval),
        /vip_catalog_terms_mismatch/,id);
    }
  }
});
test("Inactive, wrong duration, renamed and swapped VIP IDs are rejected",()=>{
  assert.throws(()=>approvedNetCraftVipRegistry(alter("explorer",{active:false}),approval),
    /vip_catalog_terms_mismatch/);
  assert.throws(()=>approvedNetCraftVipRegistry(alter("elite",{duration:"7 dias"}),approval),
    /vip_catalog_terms_mismatch/);
  assert.throws(()=>approvedNetCraftVipRegistry(alter("supreme",{name:"Supreme Plus"}),approval),
    /vip_catalog_terms_mismatch/);
  assert.throws(()=>approvedNetCraftVipRegistry(records,
    [approval[1],{...approval[0],productId:approval[2].productId},approval[2]]),
    /invalid_or_duplicate_vip_approval/);
});
test("Missing, duplicated or invalid catalogue identities are rejected",()=>{
  assert.throws(()=>approvedNetCraftVipRegistry(records.slice(1),approval),
    /vip_catalog_terms_mismatch/);
  assert.throws(()=>approvedNetCraftVipRegistry([...records,records[0]],approval),
    /invalid_or_duplicate_vip_catalog_id/);
  assert.throws(()=>approvedNetCraftVipRegistry(records,[
    approval[0],approval[1],approval[1]]),/invalid_or_duplicate_vip_approval/);
});
test("Legacy links and buyer-supplied rank tags never override the approved server mapping",()=>{
  const registry=approvedNetCraftVipRegistry(records,approval);
  assert.throws(()=>mappedDelivery({orderId:ORDER,index:0,gamertag:"Halzin5212",
    line:{productType:"vip",productId:approval[0].productId,quantity:2,
      duration:"30 dias",rankTag:"ncbr:vip_supreme"},
    registry}),/vip_product_or_duration_mismatch/);
  const job=mappedDelivery({orderId:ORDER,index:0,gamertag:"Halzin5212",
    line:{productType:"vip",productId:approval[0].productId,quantity:1,
      duration:"30 dias",rankTag:"ncbr:vip_supreme",
      paymentLink:"https://example.invalid/external"},
    registry});
  assert.equal(job.kind,"vip");
  if(job.kind==="vip")assert.equal(job.rankTag,"ncbr:vip_explorer");
});
