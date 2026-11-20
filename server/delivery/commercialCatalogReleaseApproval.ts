/**
 * Server-owned price authorization for commercial nick deliveries.
 *
 * A checkout snapshot (including catalogValidated=true) is NOT trusted as a
 * price rule. All store product IDs and amounts must be independently approved
 * on the backend. Coupons are intentionally not supported until a trusted
 * discount ledger is integrated; a client-provided discount cannot reduce the
 * total paid for a reward.
 */
import type {RewardRegistry} from "./verifiedRewardRegistry.ts";

export type CommercialApprovedPrice = Readonly<{
  productId:string;
  productType:"vip"|"product";
  priceCents:number;
}>;
export type CommercialPricedOrder = Readonly<{
  totalCents:number;
  lines:readonly Readonly<{
    productId:string;productType:string;quantity:number;duration?:string;
  }>[];
  discountCents?:unknown;
}>;

const PROD=/^[A-Za-z0-9_.-]{1,128}$/;
export function commercialPriceValidator(
  prices:readonly CommercialApprovedPrice[],
  registry:RewardRegistry,
) {
  if(!Array.isArray(prices)||prices.length===0||prices.length>200 ||
     !registry||Object.keys(registry).length===0)
    throw Error("commercial_prices_and_rewards_required");
  const trusted=new Map<string,CommercialApprovedPrice>();
  for(const p of prices){
    const reward=p&&registry[p.productId];
    if(!p||!PROD.test(p.productId)||trusted.has(p.productId)||
       !Number.isSafeInteger(p.priceCents)||p.priceCents<1||p.priceCents>1_000_000||
       !["vip","product"].includes(p.productType)||
       !reward||(p.productType==="vip")!==(reward.kind==="vip"))
      throw Error("invalid_commercial_price_approval");
    trusted.set(p.productId,Object.freeze({...p}));
  }
  return (order:CommercialPricedOrder):void=>{
    if(!order||!Array.isArray(order.lines)||order.lines.length<1||
       order.lines.length>20||!Number.isSafeInteger(order.totalCents)||
       (order.discountCents!==undefined&&order.discountCents!==0))
      throw Error("commercial_order_price_not_authorized");
    let total=0;
    for(const line of order.lines){
      const approved=trusted.get(line?.productId);
      const rule=registry[line?.productId];
      if(!approved||!rule||
         line.productType!==approved.productType||
         !Number.isSafeInteger(line.quantity)||line.quantity<1||
         line.quantity>64||
         (rule.kind==="vip"&&(line.quantity!==1||line.duration!==rule.duration)))
        throw Error("commercial_product_price_not_authorized");
      total+=approved.priceCents*line.quantity;
      if(!Number.isSafeInteger(total)||total>1_000_000)
        throw Error("commercial_total_out_of_range");
    }
    if(total!==order.totalCents)throw Error("commercial_order_amount_mismatch");
  };
}
