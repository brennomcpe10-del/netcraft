// Commercial preparation ONLY. No production checkout route imports this module
// for creating orders, and this code cannot enable charges or BDS fulfillment.
// A full rollout requires independently verified payment, deployment, refund,
// security and Minecraft BDS clone gates not satisfiable by environment flags.
import {PixError} from "./mercadoPago.ts";
export type CommercialGate = "separate_database" | "merchant_verified" |
 "orders_verified" | "webhook_replay" | "refunded_block" |
 "bds_clone_e2e" | "secure_delivery_transport" | "release_authorized";
export const requiredCommercialGates:readonly CommercialGate[]=[
 "separate_database","merchant_verified","orders_verified",
 "webhook_replay","refunded_block","bds_clone_e2e",
 "secure_delivery_transport","release_authorized",
];
export function commercialReadiness(){
 return {
  environment:"commercial_candidate" as const,
  commercialCheckoutAvailable:false as const,
  realPayments:false as const,
  minecraftDispatchEnabled:false as const,
  productionWebhookEnabled:false as const,
  configuredGates:[] as CommercialGate[],
  missingGates:[...requiredCommercialGates],
  candidateCollections:{
   orders:"pixCommercialOrders",
   webhookReceipts:"pixCommercialWebhookReceipts",
   deliveries:"pixCommercialDeliveries",
  },
  usesTestCollections:false,
  status:"release_blocked" as const,
 };
}
export function assertCommercialCheckoutDisabled():never{
 throw new PixError(
  "Checkout comercial bloqueado até aprovação da homologação completa, conta verificada e autorização de lançamento.",
  503,
 );
}
// Keeps the commercial interface separately typed without an executable path.
export type CommercialOrderCandidate={
 id:string;
 environment:"commercial";
 state:"creating" | "pending" | "processing" | "approved" |
  "expired" | "cancelled" | "refunded" | "review_required";
 totalCents:number;
 currency:"BRL";
 dispatchEnabled:false;
};
export function commercialOrderCandidate(input:unknown):never{
 void input;
 return assertCommercialCheckoutDisabled();
}
