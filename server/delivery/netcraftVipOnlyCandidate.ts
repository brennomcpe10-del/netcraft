/**
 * REVIEW CANDIDATE, NOT AN AUTHORIZATION TO CHARGE OR GRANT.
 * Exact VIP IDs/prices were cross-checked against the existing Production
 * storefront and the isolated Preview on 2026-11-05.
 *
 * This file is deliberately NOT imported by commercialVercelRuntime.ts.
 * Live authorization still requires independent signed catalog JSON approval,
 * isolated Firebase, private BDS credentials and all release gates.
 * UnBan, Teste, future kits and all unknown IDs are deliberately excluded.
 */
import {makeRewardRegistry,type RewardRule} from "./verifiedRewardRegistry.ts";
import {commercialPriceValidator,type CommercialApprovedPrice}
  from "./commercialCatalogReleaseApproval.ts";

export const netcraftVipOnlyCandidate=Object.freeze([
  Object.freeze({productId:"vip-1791128040888-vvek",name:"Explorer",
    tier:"explorer" as const,rankTag:"ncbr:vip_explorer" as const,
    priceCents:490,duration:"30 dias" as const,days:30 as const}),
  Object.freeze({productId:"vip-1791128072288-kztd",name:"Elite",
    tier:"elite" as const,rankTag:"ncbr:vip_elite" as const,
    priceCents:1290,duration:"30 dias" as const,days:30 as const}),
  Object.freeze({productId:"vip-1791128111086-kw5n",name:"Supreme",
    tier:"supreme" as const,rankTag:"ncbr:vip_supreme" as const,
    priceCents:2490,duration:"30 dias" as const,days:30 as const}),
]);

export function createNetcraftVipOnlyTestCatalog(){
  const rules:RewardRule[]=netcraftVipOnlyCandidate.map(({productId,tier,rankTag,duration,days})=>
    ({kind:"vip",productId,tier,rankTag,duration,days}));
  const prices:CommercialApprovedPrice[]=netcraftVipOnlyCandidate.map(({productId,priceCents})=>
    ({productId,productType:"vip",priceCents}));
  const registry=makeRewardRegistry(rules);
  const validatePrice=commercialPriceValidator(prices,registry);
  return Object.freeze({rules:Object.freeze(rules),prices:Object.freeze(prices),
    registry,validatePrice});
}
