/**
 * Mercado Pago commercial Orders API POST, for a reviewed private gateway only.
 * Never imported by the existing test checkout, Vercel Preview, or webhook.
 * The result of POST is NOT payment approval and grants no Minecraft product.
 */
import {PixError} from "./mercadoPago.ts";
import {createCommercialOrdersReader} from "./mercadoPagoCommercialReader.ts";
const ID=/^[a-f0-9]{64}$/;
const ORDER=/^ORD[A-Z0-9]{20,40}$/;
export function createCommercialOrdersWriter(options:{
  accessToken:string;transport?:typeof fetch;
  checkoutAuthorized:()=>boolean;
}) {
  if(typeof options.checkoutAuthorized!=="function")
    throw new PixError("commercial_checkout_authorization_required",503);
  const reader=createCommercialOrdersReader(options);
  async function createPixOrder(request:unknown,idempotencyKey:string){
    if(options.checkoutAuthorized()!==true)
      throw new PixError("commercial_checkout_release_blocked",503);
    if(!ID.test(idempotencyKey))
      throw new PixError("invalid_commercial_provider_key",400);
    if(!request||typeof request!=="object"||Array.isArray(request))
      throw new PixError("invalid_commercial_provider_request",400);
    const order=request as any;
    if(order.type!=="online"||order.processing_mode!=="automatic"||
       order.external_reference!==idempotencyKey||
       !/^[0-9]{1,5}\.[0-9]{2}$/.test(order.total_amount||"")||
       !Array.isArray(order.transactions?.payments)||
       order.transactions.payments.length!==1||
       order.transactions.payments[0]?.amount!==order.total_amount||
       order.transactions.payments[0]?.payment_method?.id!=="pix"||
       order.transactions.payments[0]?.payment_method?.type!=="bank_transfer"||
       typeof order.payer?.email!=="string"||
       !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.payer.email))
      throw new PixError("invalid_commercial_provider_request",400);
    let res:Response;
    try {
      res=await (options.transport??fetch)("https://api.mercadopago.com/v1/orders",{
        method:"POST",redirect:"error",signal:AbortSignal.timeout(15000),
        headers:{Authorization:"Bearer "+options.accessToken,
          "Content-Type":"application/json",Accept:"application/json",
          "X-Idempotency-Key":idempotencyKey},
        body:JSON.stringify(order),
      });
    } catch {throw new PixError("commercial_provider_unavailable",503);}
    if(!res.ok)throw new PixError("commercial_provider_create_unavailable",503);
    let data:any;
    try {
      const raw=await res.text();
      if(raw.length>250_000)throw Error("oversized");
      data=JSON.parse(raw);
    }catch{throw new PixError("commercial_provider_response_invalid",503);}
    if(!ORDER.test(data?.id||"")||
       data?.external_reference!==idempotencyKey||
       data?.type!=="online"||
       data?.processing_mode!=="automatic"||
       !/^[0-9]{1,24}$/.test(String(data?.user_id||""))||
       Number(data?.total_amount)!==Number(order.total_amount))
      throw new PixError("commercial_provider_create_mismatch",409);
    return data;
  }
  return Object.freeze({...reader,createPixOrder});
}
