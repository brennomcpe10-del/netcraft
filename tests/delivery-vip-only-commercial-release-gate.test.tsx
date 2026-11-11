// Gate tests never contact MP, Firestore, Minecraft or Production.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assertNetcraftVipOnlyCommercialRelease}
  from "../server/delivery/netcraftVipOnlyReleaseGuard.ts";
import {createNetcraftVipOnlyTestCatalog}
  from "../server/delivery/netcraftVipOnlyCandidate.ts";
import type {RewardRule} from "../server/delivery/verifiedRewardRegistry.ts";
import type {CommercialApprovedPrice}
  from "../server/delivery/commercialCatalogReleaseApproval.ts";
const approved=()=>createNetcraftVipOnlyTestCatalog();
const copy=()=>{
  const c=approved();
  return {
    rules:c.rules.map(r=>({...r})) as RewardRule[],
    prices:c.prices.map(p=>({...p})) as CommercialApprovedPrice[],
  };
};
test("approved three VIPs are the ONLY allowed commercial release snapshot",()=>{
  const v=copy();
  assert.deepEqual(v.rules.map(r=>r.productId).sort(),
    v.prices.map(p=>p.productId).sort());
  assert.equal(v.rules.length,3);
  assert.doesNotThrow(()=>assertNetcraftVipOnlyCommercialRelease(v.rules,v.prices));
  // Approval is order-independent, but IDs and exact metadata are not.
  assert.doesNotThrow(()=>assertNetcraftVipOnlyCommercialRelease(
    [...v.rules].reverse(),[...v.prices].reverse()));
});
test("missing, extra, swapped, duplicate or unknown VIP is rejected",()=>{
  const v=copy();
  const deny=(rules:RewardRule[],prices:CommercialApprovedPrice[])=>
    assert.throws(()=>assertNetcraftVipOnlyCommercialRelease(rules,prices),
      /netcraft_vip_only/);
  deny(v.rules.slice(0,2),v.prices);
  deny(v.rules,v.prices.slice(0,2));
  deny([...v.rules,v.rules[0]],v.prices);
  deny(v.rules,[...v.prices,v.prices[0]]);
  deny([v.rules[0],v.rules[0],v.rules[2]],v.prices);
  deny(v.rules,[v.prices[0],v.prices[0],v.prices[2]]);
  deny(v.rules.map((r,i)=>i===0?{...r,productId:"vip-created-in-cart"}:r),v.prices);
  deny(v.rules,v.prices.map((p,i)=>i===0?{...p,productId:"fake-vip"}:p));
  deny(v.rules.map((r,i)=>i===0?{...r,productId:v.rules[1].productId}:r),v.prices);
});
test("price, tier, duration, rank, non-vip, and unexpected metadata fail closed",()=>{
  const v=copy();
  const mutateRule=(idx:number,patch:Record<string,unknown>)=>
    assert.throws(()=>assertNetcraftVipOnlyCommercialRelease(
      v.rules.map((r,i)=>i===idx?{...r,...patch} as RewardRule:r),v.prices),
      /netcraft_vip_only/);
  const mutatePrice=(idx:number,patch:Record<string,unknown>)=>
    assert.throws(()=>assertNetcraftVipOnlyCommercialRelease(v.rules,
      v.prices.map((p,i)=>i===idx?{...p,...patch} as CommercialApprovedPrice:p)),
      /netcraft_vip_only/);
  mutateRule(0,{tier:"elite"});
  mutateRule(1,{rankTag:"ncbr:vip_supreme"});
  mutateRule(2,{days:365});
  mutateRule(2,{duration:"permanent"});
  mutateRule(1,{kind:"items",items:[{itemId:"minecraft:diamond",quantity:64}]});
  mutateRule(0,{extraAuthorization:"granted"});
  mutatePrice(0,{priceCents:1});
  mutatePrice(1,{priceCents:0});
  mutatePrice(2,{productType:"product"});
  mutatePrice(2,{discountCents:100});
  const nullValue=null as unknown as readonly RewardRule[];
  assert.throws(()=>assertNetcraftVipOnlyCommercialRelease(nullValue,v.prices),
    /netcraft_vip_only/);
});
test("actual Vercel runtime checks VIP-only release before selecting catalog",()=>{
  const src=requireSource();
  assert.match(src,/assertNetcraftVipOnlyCommercialRelease\(rules,prices\)/);
  assert.match(src,/const registry=makeRewardRegistry\(rules\)/);
  assert.ok(src.indexOf("assertNetcraftVipOnlyCommercialRelease(rules,prices)")<
    src.indexOf("const registry=makeRewardRegistry(rules)"));
  assert.match(src,/NCBR_COMMERCIAL_FIREBASE_ISOLATED/);
  assert.match(src,/NETCRAFT_DELIVERY_RELEASE_APPROVED/);
});
function requireSource(){return readFileSync("server/delivery/commercialVercelRuntime.ts","utf8");}
