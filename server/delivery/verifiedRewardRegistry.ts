// Server-owned reward authorization for the OFF commercial-candidate laboratory.
// A storefront snapshot is NEVER a grant rule. Registry updates require a
// separate controlled release; a checkout cannot supply/override these values.
import crypto from "node:crypto";
export type VipTier = "explorer"|"elite"|"supreme";
export type VipRule = {
  kind:"vip"; productId:string; tier:VipTier;
  rankTag:"ncbr:vip_explorer"|"ncbr:vip_elite"|"ncbr:vip_supreme";
  duration:"30 dias"; days:30;
};
export type KitRule = {
  kind:"items"; productId:string;
  items:readonly {itemId:string;quantity:number}[];
};
export type RewardRule = KitRule|VipRule;
export type RewardRegistry = Readonly<Record<string,RewardRule>>;
const ranks:Record<VipTier,VipRule["rankTag"]> = {
  explorer:"ncbr:vip_explorer",elite:"ncbr:vip_elite",supreme:"ncbr:vip_supreme",
};
const validProduct=/^[a-zA-Z0-9_.-]{1,128}$/;
const validItem=/^minecraft:[a-z0-9_]+$/;
// This is a strict registry builder. No product is enabled by name inference,
// price, or user input. Callers supply actual admin-approved store IDs.
export function makeRewardRegistry(rules:readonly RewardRule[]):RewardRegistry {
  if(!Array.isArray(rules)||rules.length>200)throw Error("invalid_reward_registry");
  const result:Record<string,RewardRule>={};
  for(const rule of rules){
    if(!rule||!validProduct.test(rule.productId)||result[rule.productId])
      throw Error("invalid_or_duplicate_reward_product");
    if(rule.kind==="vip"){
      if(!["explorer","elite","supreme"].includes(rule.tier)||
         rule.rankTag!==ranks[rule.tier]||rule.duration!=="30 dias"||
         rule.days!==30)
        throw Error("unapproved_vip_rank_or_duration");
      result[rule.productId]=Object.freeze({...rule});
    }else if(rule.kind==="items"){
      if(!Array.isArray(rule.items)||!rule.items.length||rule.items.length>36)
        throw Error("invalid_kit_mapping");
      const seen=new Set<string>();
      let sum=0;
      for(const item of rule.items) {
        if(!item||!validItem.test(item.itemId)||
           !Number.isSafeInteger(item.quantity)||item.quantity<1||
           item.quantity>2304||seen.has(item.itemId))
          throw Error("invalid_kit_mapping");
        seen.add(item.itemId);sum+=item.quantity;
      }
      if(sum>2304)throw Error("kit_capacity_exceeded");
      result[rule.productId]=Object.freeze({
        kind:"items" as const,productId:rule.productId,
        items:Object.freeze(rule.items.map(x=>Object.freeze({...x}))),
      });
    }else throw Error("unapproved_reward_kind");
  }
  return Object.freeze(result);
}
export type RewardDeliveryPayload={
  contract:"netcraft.delivery.v1";id:string;orderId:string;gamertag:string;
} & (
  {kind:"items";items:{itemId:string;quantity:number}[]}|
  {kind:"vip";rankTag:VipRule["rankTag"];days:30}
);
export function mappedDelivery(input:{
  orderId:string;index:number;gamertag:string;
  line:any;registry:RewardRegistry;
}):RewardDeliveryPayload {
  if(!/^[a-f0-9]{64}$/.test(input.orderId)||
     !Number.isSafeInteger(input.index)||input.index<0||input.index>999||
     typeof input.gamertag!=="string"||
     !/^[A-Za-z0-9_ ]{3,32}$/.test(input.gamertag)||
     input.gamertag!==input.gamertag.trim())
    throw Error("invalid_verified_delivery_target");
  const line=input.line,rule=input.registry[line?.productId];
  if(!rule||!line||!validProduct.test(line.productId)||
     !Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>64)
    throw Error("unmapped_store_product");
  const base={contract:"netcraft.delivery.v1" as const,
    id:input.orderId+"-"+input.index,orderId:input.orderId,gamertag:input.gamertag};
  if(rule.kind==="vip"){
    if(line.productType!=="vip"||line.quantity!==1||
       line.duration!==rule.duration)
      throw Error("vip_product_or_duration_mismatch");
    return {...base,kind:"vip",rankTag:rule.rankTag,days:rule.days};
  }
  if(line.productType!=="product"||
     line.reward?.version!==1||!Array.isArray(line.reward.items))
    throw Error("unapproved_kit_snapshot");
  // A snapshot is only accepted when it equals the approved immutable mapping;
  // addon/custom items remain denied until explicitly implemented and tested.
  const expected=rule.items.map(x=>({...x})).sort((a,b)=>a.itemId.localeCompare(b.itemId));
  const received=line.reward.items.map((x:any)=>({itemId:x?.itemId,quantity:x?.quantity}))
    .sort((a:any,b:any)=>String(a.itemId).localeCompare(String(b.itemId)));
  if(JSON.stringify(expected)!==JSON.stringify(received))
    throw Error("kit_snapshot_registry_mismatch");
  const items=expected.map(x=>({...x,quantity:x.quantity*line.quantity}));
  const total=items.reduce((sum,x)=>sum+x.quantity,0);
  if(total>2304||items.some(x=>x.quantity>2304))
    throw Error("kit_quantity_over_executor_limit");
  return {...base,kind:"items",items};
}
export const registryDigest=(registry:RewardRegistry)=>crypto.createHash("sha256")
 .update(JSON.stringify(Object.keys(registry).sort().map(id=>registry[id])))
 .digest("hex");
