/**
 * NetCraftBR MVP: the VERIFIED Preview Pix outbox gets an exact VIP draft.
 * This runs after Orders API reconciliation (never on a webhook's claim).
 * It CANNOT grant a VIP; recipients must be linked and release reviewed later.
 */
import {
  NETCRAFT_PREVIEW_VIP_APPROVALS,
} from "./netcraftVipPreviewApproval.ts";
import {NETCRAFT_VIP_TERMS} from "./netcraftVipCatalogApproval.ts";

const previewById=new Map(NETCRAFT_PREVIEW_VIP_APPROVALS.map(x=>[x.productId,x.tier]));
const ID=/^[a-f0-9]{64}$/;
const NAME=/^[A-Za-z0-9_ ]{3,32}$/;
export function previewPaidVipCoreDraft(order:any,index:number){
  const held=(reason:string)=>({
    schema:1 as const,eligible:false as const,dispatchEnabled:false as const,
    reason,payload:null as null|Record<string,unknown>,
  });
  if(!order || order.environment!=="test" ||
     order.receiverIsTestAccount!==true || order.apiVersion!=="orders-v1" ||
     order.state!=="approved" || !ID.test(order.id||"") ||
     !NAME.test(order.gamertag||"") ||
     !Array.isArray(order.lines)||order.lines.length!==1 ||
     index!==0||order.discountCents!==0||
     order.paymentReviewRequired===true)
    return held("unapproved_or_unsupported_test_order");
  const line=order.lines[0],tier=previewById.get(line?.productId);
  if(!tier)return held("vip_not_approved");
  const terms=NETCRAFT_VIP_TERMS[tier];
  if(line.productType!=="vip" || line.quantity!==1 ||
     line.duration!==terms.duration ||
     order.totalCents!==terms.priceCents ||
     order.subtotalCents!==terms.priceCents)
    return held("vip_order_or_amount_mismatch");
  return Object.freeze({
    schema:1 as const,
    eligible:false as const, // an approved test payment is NOT delivery authority
    dispatchEnabled:false as const,
    reason:"bridge_identity_and_release_required" as const,
    payload:Object.freeze({
      contract:"netcraft.delivery.v1" as const,
      id:order.id+"-0",orderId:order.id,gamertag:order.gamertag,
      kind:"vip" as const,rankTag:terms.rankTag,days:30 as const,
    }),
  });
}
