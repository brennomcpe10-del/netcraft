/**
 * Buyer-initiated reconciliation when a signed Mercado Pago webhook is lost.
 *
 * Only invoked after the checkout-key digest has been authenticated by the
 * commercial HTTP route. Never trusts a browser-provided paid status,
 * amount, inventory or delivery receipt.
 *
 * Release gates, authoritative Orders GET, catalog checks and transactional
 * queue deduplication are enforced by the existing private delivery service.
 * This helper does not enable any production flags or deploy a bridge.
 */
import {PixError} from "../payments/mercadoPago.ts";

export type CommercialBuyerOrderView = Readonly<{
  id:string;
  state?:string;
  status?:string;
  providerOrderId?:string|null;
}>;

export async function refreshCommercialBuyerOrder<
  V extends CommercialBuyerOrderView,
>(input:{
  checkout:{viewByCheckoutKey:(key:string)=>Promise<V>};
  delivery:{reconcileVerifiedOrder:(id:string)=>Promise<unknown>};
},checkoutKey:string,expectedId:string):Promise<V>{
  if(!/^[a-f0-9]{64}$/.test(expectedId))
    throw new PixError("invalid_commercial_order_id",400);
  const first=await input.checkout.viewByCheckoutKey(checkoutKey);
  if(first?.id!==expectedId)
    throw new PixError("checkout_order_binding_mismatch",409);
  // Never process a nonexistent or unfinished order: it may not yet be
  // bound to an actual Mercado Pago Orders resource.
  if(!first.providerOrderId)return first;
  // The private service re-fetches the order from the provider even when
  // this order was previously approved, detecting refunds/disputes after ACK.
  await input.delivery.reconcileVerifiedOrder(expectedId);
  const latest=await input.checkout.viewByCheckoutKey(checkoutKey);
  if(latest?.id!==expectedId)
    throw new PixError("checkout_order_binding_mismatch",409);
  return latest;
}
