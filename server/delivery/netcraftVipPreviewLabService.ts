/**
 * NETCRAFTBR: VIP-only paid-order -> delivery queue laboratory adapter.
 *
 * This module is deliberately NOT imported by a Vercel route, Cloudflare
 * Worker, scheduled job or Bedrock entrypoint. It operates only through the
 * emulator-gated createCommercialStagingService. No real sales or grants.
 *
 * The "live_mode" property of the TEST fixture is used to challenge the
 * inspector; this does not enable payments in any environment.
 */
import type {Firestore} from "firebase-admin/firestore";
import {
  createCommercialStagingService,
  type StoredOrder,
} from "./commercialStagingService.ts";
import type {CommercialGatewayReader} from "../payments/commercialInspection.ts";
import {
  NETCRAFT_PREVIEW_VIP_APPROVALS,netcraftPreviewVipRegistry,
} from "./netcraftVipPreviewApproval.ts";
import {
  NETCRAFT_VIP_TERMS,type CatalogVipForApproval,
} from "./netcraftVipCatalogApproval.ts";

type DB=Pick<Firestore,"collection"|"runTransaction">;
const termsById=new Map(NETCRAFT_PREVIEW_VIP_APPROVALS.map(x=>[
  x.productId,NETCRAFT_VIP_TERMS[x.tier],
] as const));

/**
 * Never infer an entitlement from order total alone: enforce the exact,
 * explicitly approved Preview product ID, one plan, one unit, duration and
 * price. The payment processor also has to verify amount, merchant, order ID,
 * payment status and currency independently.
 */
export function validateNetCraftPreviewVipOrder(
  order:Readonly<StoredOrder>,
):void {
  if(order.lines.length!==1)
    throw Error("vip_single_plan_only");
  const line=order.lines[0];
  const terms=termsById.get(line.productId);
  if(!terms||line.productType!=="vip"||line.quantity!==1||
     line.duration!==terms.duration)
    throw Error("vip_product_not_approved");
  if(order.currency!=="BRL"||!Number.isSafeInteger(order.totalCents)||
     order.totalCents!==terms.priceCents)
    throw Error("vip_order_amount_mismatch");
}

/**
 * Only a trusted server-owned Preview catalog snapshot may be passed here.
 * A forged browser catalog must never serve as an authorization source.
 * If a catalog record changes or is inactive, ALL three VIPs are blocked.
 */
export function createNetCraftPreviewVipLabService(
  db:DB,
  reader:CommercialGatewayReader,
  opts:{
    catalog:readonly CatalogVipForApproval[];
    keyring:Readonly<Record<string,string>>;
    now?:()=>number;
  },
){
  const registry=netcraftPreviewVipRegistry(opts.catalog);
  return createCommercialStagingService(db,reader,{
    registry,keyring:opts.keyring,now:opts.now,
    validateOrder:validateNetCraftPreviewVipOrder,
  });
}
