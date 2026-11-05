/**
 * Composition point for the REAL NetCraftBR nick-delivery backend.
 *
 * Not mounted by the store or Vercel. To deploy, an independently reviewed
 * HTTPS-only gateway must supply Firestore, approved production catalog IDs,
 * provider access, private BDS keys, signed webhooks, and a release decision.
 * A nick is a gift/delivery DESTINATION, not an Xbox login.
 */
import type {Firestore} from "firebase-admin/firestore";
import {PixError,webhookSignature} from "../payments/mercadoPago.ts";
import type {CommercialGatewayReader} from "../payments/commercialInspection.ts";
import {commercialPriceValidator,type CommercialApprovedPrice}
  from "./commercialCatalogReleaseApproval.ts";
import {createCommercialNickReleaseService} from "./commercialNickReleaseService.ts";
import type {RewardRegistry} from "./verifiedRewardRegistry.ts";
import {createBdsNickPrivateRouter} from "../routes/deliveryNickPrivate.ts";

const ID=/^[a-f0-9]{64}$/;
const ORDER=/^ORD[A-Z0-9]{20,40}$/;
const REQUEST=/^[A-Za-z0-9-]{1,128}$/;
export function createNetCraftCommercialNickGateway(input:{
  db:Pick<Firestore,"collection"|"runTransaction">;
  provider:CommercialGatewayReader;
  registry:RewardRegistry;
  approvedPrices:readonly CommercialApprovedPrice[];
  bdsOpaqueToken:string;
  privateHmacKey:string;
  webhookSecret:string;
  authorizeOrderForDispatch:(order:Readonly<{
    id:string;providerOrderId:string;gamertag:string;
  }>)=>Promise<boolean>;
  now?:()=>number;
}){
  if(typeof input.webhookSecret!=="string"||input.webhookSecret.length<32 ||
     typeof input.authorizeOrderForDispatch!=="function")
    throw new PixError("private_commercial_configuration_required",503);
  const priceCheck=commercialPriceValidator(input.approvedPrices,input.registry);
  const service=createCommercialNickReleaseService(input.db,input.provider,{
    registry:input.registry,
    keyring:{netcraft_nick_private:input.privateHmacKey},
    now:input.now,
    validateOrder:priceCheck,
    authorizeOrderForDispatch:input.authorizeOrderForDispatch,
  });
  const router=createBdsNickPrivateRouter({
    service,secret:input.bdsOpaqueToken,hmacKey:input.privateHmacKey,
    now:input.now,
  });
  /**
   * Called only by a public webhook adapter that faithfully passes the
   * original query id + headers, after TLS termination. Never trust the
   * webhook payload as proof of payment: resolve Orders GET and reconcile.
   */
  async function reconcileSignedOrderNotification(notification:{
    orderId:string;requestId:string;signature:string;type:string;
  }){
    if(!ORDER.test(notification?.orderId||"") ||
       !REQUEST.test(notification?.requestId||"") ||
       !["order","orders"].includes(notification?.type) ||
       !webhookSignature(notification.orderId,notification.requestId,
         notification.signature,input.webhookSecret,input.now?.()??Date.now()))
      throw new PixError("unverified_commercial_notification",401);
    const resource=await input.provider.get(notification.orderId);
    if(resource?.id!==notification.orderId ||
       !ID.test(resource?.external_reference||""))
      throw new PixError("commercial_notification_order_mismatch",409);
    // Repeat provider verification and match merchant, total and products in
    // the durable service. Retries of the same signed event are idempotent.
    return service.reconcileAndQueue(resource.external_reference);
  }
  return Object.freeze({
    router, // Dedicated private HTTPS server ONLY; never a public browser mount
    reconcileSignedOrderNotification,
    reconcileVerifiedOrder:service.reconcileAndQueue,
    recoverUncertainLeases:service.recoverAfterRestart,
    inspectDelivery:service.diagnose,
    deployment:"REQUIRES_REVIEWED_PRIVATE_GATEWAY" as const,
  });
}
