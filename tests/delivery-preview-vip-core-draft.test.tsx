import test from "node:test";
import assert from "node:assert/strict";
import {previewPaidVipCoreDraft} from "../server/delivery/previewPaidVipCoreDraft.ts";
import {NETCRAFT_PREVIEW_VIP_APPROVALS} from "../server/delivery/netcraftVipPreviewApproval.ts";
import {NETCRAFT_VIP_TERMS} from "../server/delivery/netcraftVipCatalogApproval.ts";
const id="a".repeat(64);
const make=(tier:"explorer"|"elite"|"supreme")=>{
  const terms=NETCRAFT_VIP_TERMS[tier],approved=NETCRAFT_PREVIEW_VIP_APPROVALS
    .find(x=>x.tier===tier)!;
  return {id,apiVersion:"orders-v1",environment:"test",receiverIsTestAccount:true,
    state:"approved",gamertag:"Fake Player",discountCents:0,
    totalCents:terms.priceCents,subtotalCents:terms.priceCents,
    lines:[{productType:"vip",productId:approved.productId,
      quantity:1,duration:"30 dias"}]};
};
test("Site Preview paid VIPs: exact IDs and terms map to Core held payloads",()=>{
 for(const tier of ["explorer","elite","supreme"] as const){
   const draft=previewPaidVipCoreDraft(make(tier),0);
   assert.equal(draft.reason,"bridge_identity_and_release_required");
   assert.equal(draft.eligible,false);
   assert.equal(draft.dispatchEnabled,false);
   assert.equal(draft.payload?.rankTag,NETCRAFT_VIP_TERMS[tier].rankTag);
   assert.equal(draft.payload?.days,30);
 }
});
test("Site Preview: server-priced VIP discount remains a held draft",()=>{
 const order={...make("elite"),discountCents:100,totalCents:1190};
 const draft=previewPaidVipCoreDraft(order,0);
 assert.equal(draft.payload?.rankTag,"ncbr:vip_elite");
 assert.equal(draft.dispatchEnabled,false);
});
test("Site Preview: tampered totals, states and catalog never create a payload",()=>{
 const cases=[
  {...make("explorer"),totalCents:1},
  {...make("explorer"),discountCents:1},
  {...make("explorer"),state:"pending"},
  {...make("explorer"),state:"refunded"},
  {...make("explorer"),paymentReviewRequired:true},
  {...make("explorer"),environment:"commercial"},
  {...make("explorer"),gamertag:""},
  {...make("explorer"),lines:[{...make("explorer").lines[0],quantity:2}]},
  {...make("explorer"),lines:[{...make("explorer").lines[0],productId:"other"}]},
 ];
 for(const order of cases){
   const v=previewPaidVipCoreDraft(order,0);
   assert.equal(v.payload,null);
   assert.equal(v.dispatchEnabled,false);
 }
});
