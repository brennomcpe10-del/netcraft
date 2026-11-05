/**
 * Read-only Mercado Pago Orders API adapter for a separately deployed,
 * reviewed commercial NetCraft Delivery gateway.
 *
 * It NEVER creates charges, POSTs payments or reads browser-provided tokens.
 * All grant decisions remain in inspectCommercialOrder + the server-approved
 * registry/price map + commercialNickReleaseService.
 */
import {PixError} from "./mercadoPago.ts";
import type {CommercialGatewayReader} from "./commercialInspection.ts";

const ORDER=/^ORD[A-Z0-9]{20,40}$/;
export function createCommercialOrdersReader(options:{
  accessToken:string;transport?:typeof fetch;
}):CommercialGatewayReader{
  const token=options?.accessToken;
  if(typeof token!=="string"||
     !/^APP_USR-[A-Za-z0-9-]{24,}$/.test(token))
    throw new PixError("private_merchant_credentials_required",503);
  if(process.env.NODE_ENV!=="production"||process.env.VERCEL_ENV||
     process.env.FIRESTORE_EMULATOR_HOST)
    throw new PixError("commercial_provider_reader_release_blocked",503);
  const request=async (path:string)=>{
    const fetcher=options.transport??fetch;
    let response:Response;
    try{
      response=await fetcher("https://api.mercadopago.com"+path,{
        method:"GET",
        headers:{Authorization:"Bearer "+token,Accept:"application/json"},
        redirect:"error",
        signal:AbortSignal.timeout(15000),
      });
    }catch{
      throw new PixError("commercial_provider_unavailable",503);
    }
    if(!response.ok)throw new PixError("commercial_provider_unavailable",503);
    let value:any;
    try{
      // This adapter never logs free-form provider errors or personal data.
      const raw=await response.text();
      if(raw.length>250_000)throw Error("oversize");
      value=JSON.parse(raw);
    }catch{throw new PixError("invalid_commercial_provider_response",503);}
    if(!value||typeof value!=="object"||Array.isArray(value))
      throw new PixError("invalid_commercial_provider_response",503);
    return value;
  };
  return Object.freeze({
    async me(){
      const data=await request("/users/me");
      if(!/^[0-9]{1,24}$/.test(String(data.id||"")))
        throw new PixError("merchant_identity_unavailable",503);
      return {id:String(data.id),
        netcraftTestAccount:Array.isArray(data.tags)&&data.tags.includes("test_user")};
    },
    async get(providerId:string){
      if(!ORDER.test(providerId||""))
        throw new PixError("invalid_commercial_provider_order_id",400);
      return request("/v1/orders/"+providerId);
    },
  });
}
