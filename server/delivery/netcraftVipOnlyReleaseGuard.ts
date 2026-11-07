/**
 * Final server-side VIP-only commercial release boundary (DENY ONLY).
 *
 * Comparing against a reviewed immutable, exact product-id/tier/price map
 * does NOT authorize Pix, activate grants, deploy a Worker, or bind accounts.
 * All existing runtime and hosting gates remain independently required.
 */
import type {RewardRule} from "./verifiedRewardRegistry.ts";
import type {CommercialApprovedPrice} from "./commercialCatalogReleaseApproval.ts";
import {netcraftVipOnlyCandidate} from "./netcraftVipOnlyCandidate.ts";

const vipKeys=["kind","productId","tier","rankTag","duration","days"];
const priceKeys=["productId","productType","priceCents"];
const exact=(value:unknown,keys:readonly string[])=>
  !!value && typeof value==="object" && !Array.isArray(value) &&
  Object.keys(value).length===keys.length &&
  Object.keys(value).every(key=>keys.includes(key));

export function assertNetcraftVipOnlyCommercialRelease(
  rules:readonly RewardRule[],prices:readonly CommercialApprovedPrice[],
):void {
  if(!Array.isArray(rules)||!Array.isArray(prices)||
     rules.length!==3||prices.length!==3)
    throw new Error("netcraft_vip_only_approval_incomplete");
  const byRule=new Map<string,RewardRule>(),byPrice=new Map<string,CommercialApprovedPrice>();
  for(const rule of rules){
    if(!exact(rule,vipKeys)||rule.kind!=="vip"||byRule.has(rule.productId))
      throw new Error("netcraft_vip_only_rule_invalid");
    byRule.set(rule.productId,rule);
  }
  for(const price of prices){
    if(!exact(price,priceKeys)||price.productType!=="vip"||
       byPrice.has(price.productId))
      throw new Error("netcraft_vip_only_price_invalid");
    byPrice.set(price.productId,price);
  }
  for(const approved of netcraftVipOnlyCandidate){
    const rule=byRule.get(approved.productId);
    const price=byPrice.get(approved.productId);
    if(!rule||rule.kind!=="vip"||!price||
       rule.tier!==approved.tier||rule.rankTag!==approved.rankTag||
       rule.duration!==approved.duration||rule.days!==approved.days||
       price.productType!=="vip"||price.priceCents!==approved.priceCents)
      throw new Error("netcraft_vip_only_approval_mismatch");
  }
  // No extras, shadow products, discounts, kits, renames or aliases.
  if(byRule.size!==3||byPrice.size!==3)
    throw new Error("netcraft_vip_only_approval_mismatch");
}
