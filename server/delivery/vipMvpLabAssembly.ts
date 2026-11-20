/**
 * One assembly point for the NetCraftBR VIP MVP, kept outside public routes.
 * Site-side private bridge -> verified provider-backed Firestore queue.
 * Never uses a storefront-supplied catalog, game command or browser secret.
 *
 * This release candidate intentionally requires the Firestore Emulator and
 * returns only held offers (dispatchEnabled:false). It is NOT a commercial
 * activation or a fully configured Bedrock transport.
 */
import type {Firestore} from "firebase-admin/firestore";
import type {CommercialGatewayReader} from "../payments/commercialInspection.ts";
import type {CatalogVipForApproval} from "./netcraftVipCatalogApproval.ts";
import {createNetCraftPreviewVipLabService} from "./netcraftVipPreviewLabService.ts";
import {createBdsMvpLocalRouter} from "../routes/deliveryMvpLab.ts";
export function createNetCraftVipMvpLabGateway(input:{
  db:Pick<Firestore,"collection"|"runTransaction">;
  provider:CommercialGatewayReader; // independent Orders API verification
  trustedCatalog:readonly CatalogVipForApproval[];
  bdsOpaqueToken:string;
  privateHmacKey:string;
  now?:()=>number;
}){
  const service=createNetCraftPreviewVipLabService(input.db,input.provider,{
    catalog:input.trustedCatalog,
    keyring:{netcraft_mvp_lab:input.privateHmacKey},
    now:input.now,
  });
  const router=createBdsMvpLocalRouter({
    service,secret:input.bdsOpaqueToken,hmacKey:input.privateHmacKey,
    now:input.now,
  });
  return Object.freeze({
    router,
    reconcilePaidOrder:service.reconcileAndQueue,
    recoverUncertainLeases:service.recoverAfterRestart,
    inspectHeldDelivery:service.diagnose,
    // Never turn dispatch on through this API.
    mode:"LAB_OFF" as const,
    dispatchEnabled:false as const,
    productionReady:false as const,
  });
}
