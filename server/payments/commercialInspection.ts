// Read-only candidate for a future commercial reconciliation flow.
// Not imported by executable checkout or webhooks. NEVER writes a receipt,
// changes a payment state, creates a delivery, or authorizes a Minecraft grant.
import {PixError} from "./mercadoPago.ts";
import {amountCents,orderIdPattern,ordersState,paymentIdPattern} from "./ordersContract.ts";
export type CommercialStoredOrder={
 id:string;providerOrderId:string;collector:string;
 totalCents:number;currency:"BRL";
};
export type CommercialGatewayReader={
 me():Promise<{id:string|number;netcraftTestAccount:boolean}>;
 get(providerId:string):Promise<any>;
};
export type CommercialInspection={
 state:"pending"|"processing"|"approved"|"expired"|"cancelled"|"refunded";
 providerVerified:true;
 canDispatch:false;
 requiresReview:boolean;
 reason:"payment_not_approved"|"release_not_authorized"|"refund_or_chargeback"|
  "payment_cancelled"|"payment_expired";
};
export async function inspectCommercialOrder(
 order:CommercialStoredOrder,reader:CommercialGatewayReader,
):Promise<CommercialInspection>{
 if(!/^[a-f0-9]{64}$/.test(order?.id)||!orderIdPattern.test(order?.providerOrderId||"")||
    !/^\d{1,24}$/.test(String(order?.collector))||order.currency!=="BRL"||
    !Number.isSafeInteger(order.totalCents)||order.totalCents<1||order.totalCents>1000000)
  throw new PixError("Pedido comercial não autorizado para inspeção.",409);
 const merchant=await reader.me();
 if(merchant.netcraftTestAccount!==false ||
    String(merchant.id)!==order.collector)
  throw new PixError("Recebedor comercial divergente.",409);
 const resource=await reader.get(order.providerOrderId);
 if(!orderIdPattern.test(resource?.id||"")||resource.id!==order.providerOrderId||
    resource.type!=="online"||resource.external_reference!==order.id||
    String(resource.user_id)!==order.collector||
    !["BRA","MLB"].includes(resource.country_code)||
    (resource.currency_id!==undefined&&resource.currency_id!=="BRL")||
    resource.live_mode!==true||
    amountCents(resource.total_amount)!==order.totalCents)
  throw new PixError("Order comercial não corresponde ao pedido original.",409);
 const payments=resource.transactions?.payments;
 const empty=Array.isArray(payments)&&payments.length===0;
 const pendingWithoutPayment=(!payments||empty)&&
   ["created","processing"].includes(resource.status);
 if(!pendingWithoutPayment && (!Array.isArray(payments)||payments.length!==1))
  throw new PixError("Transações comerciais inesperadas.",409);
 const payment=pendingWithoutPayment?null:payments[0];
 if(payment && (!paymentIdPattern.test(payment.id||"")||
    amountCents(payment.amount)!==order.totalCents||
    payment.payment_method?.id!=="pix"||
    payment.payment_method?.type!=="bank_transfer"))
  throw new PixError("Transação comercial incompatível.",409);
 const expiry=payment?.date_of_expiration??"2099-01-01T00:00:00Z";
 const state=ordersState(resource,payment,expiry) as CommercialInspection["state"];
 const reason=state==="refunded"?"refund_or_chargeback"
  :state==="cancelled"?"payment_cancelled"
  :state==="expired"?"payment_expired"
  :state==="approved"?"release_not_authorized"
  :"payment_not_approved";
 return {state,providerVerified:true,canDispatch:false,
   requiresReview:state==="refunded"||state==="cancelled",reason};
}
