/**
 * NetCraftBR commercial Pix checkout. Separate from pixTestOrders.
 * UNMOUNTED candidate: host must check release, live merchant and isolation.
 * This service has no public route and cannot be started by environment flags alone.
 */
import crypto from "node:crypto";
import type {Firestore} from "firebase-admin/firestore";
import {PixError} from "../payments/mercadoPago.ts";
import type {CommercialGatewayReader} from "../payments/commercialInspection.ts";
import {commercialPriceValidator,type CommercialApprovedPrice} from "./commercialCatalogReleaseApproval.ts";
import type {RewardRegistry} from "./verifiedRewardRegistry.ts";
type DB=Pick<Firestore,"collection"|"runTransaction">;
type Request={gamertag:string;email:string;
  lines:readonly {productId:string;quantity:number}[];couponCode?:unknown};
export type CommercialOrderWriter=CommercialGatewayReader & {
  createPixOrder:(request:unknown,idempotencyKey:string)=>Promise<any>;
};
const NAME=/^[A-Za-z0-9_ ]{3,32}$/;
const EMAIL=/^[^\s@]{1,100}@[^\s@]{1,100}\.[^\s@]{2,30}$/;
const KEY=/^[A-Za-z0-9-]{20,80}$/;
const ORDER=/^ORD[A-Z0-9]{20,40}$/;
const hash=(x:unknown)=>crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
export function createNetCraftCommercialCheckout(input:{
  db:DB;provider:CommercialOrderWriter;
  registry:RewardRegistry;approvedPrices:readonly CommercialApprovedPrice[];
  releaseApproved:()=>boolean;now?:()=>number;
}) {
  const priceCheck=commercialPriceValidator(input.approvedPrices,input.registry);
  const prices=new Map(input.approvedPrices.map(p=>[p.productId,p]));
  const orders=input.db.collection("pixCommercialOrders");
  const providerBindings=input.db.collection("pixCommercialProviderBindings");
  const now=input.now??Date.now;
  const release=()=>{
    if(input.releaseApproved?.()!==true)
      throw new PixError("commercial_checkout_release_blocked",503);
  };
  const parse=(raw:Request)=>{
    if(!raw||typeof raw!=="object"||Array.isArray(raw)||
       typeof raw.gamertag!=="string"||!NAME.test(raw.gamertag)||
       raw.gamertag!==raw.gamertag.trim()||typeof raw.email!=="string"||
       !EMAIL.test(raw.email)||raw.couponCode!==undefined||
       !Array.isArray(raw.lines)||raw.lines.length<1||raw.lines.length>20)
      throw new PixError("invalid_commercial_checkout",400);
    let vipCount=0,totalCents=0;
    const lines=raw.lines.map(line=>{
      if(!line||typeof line.productId!=="string"||
         !Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>64)
        throw new PixError("invalid_commercial_line",400);
      const price=prices.get(line.productId),rule=input.registry[line.productId];
      if(!rule||!price)throw new PixError("unapproved_commercial_product",409);
      totalCents+=price.priceCents*line.quantity;
      if(rule.kind==="vip"){
        vipCount+=line.quantity;
        return {productType:"vip" as const,productId:line.productId,
          quantity:line.quantity,duration:rule.duration};
      }
      return {productType:"product" as const,productId:line.productId,
        quantity:line.quantity,reward:{version:1 as const,
          items:rule.items.map(x=>({itemId:x.itemId,quantity:x.quantity}))}};
    });
    if(vipCount>1||!Number.isSafeInteger(totalCents)||
       totalCents<1||totalCents>1_000_000)
      throw new PixError("unsupported_commercial_cart",409);
    priceCheck({totalCents,lines});
    return {gamertag:raw.gamertag,email:raw.email,lines,totalCents};
  };
  const idFor=(key:string)=>crypto.createHash("sha256")
    .update("netcraft-commercial-v1:"+key).digest("hex");
  async function viewByCheckoutKey(key:string){
    release();
    if(!KEY.test(key))throw new PixError("invalid_commercial_idempotency_key",400);
    const id=idFor(key),order=(await orders.doc(id).get()).data();
    if(!order||order.environment!=="commercial")
      return {id,status:"not_found" as const};
    const result:{id:string;state:string;providerOrderId:string|null;
      totalCents:number;currency:"BRL";qrCode?:string;qrCodeBase64?:string}={
      id,state:order.state,providerOrderId:order.providerOrderId??null,
      totalCents:order.totalCents,currency:"BRL",
    };
    // Fetch QR only from a live, matched provider GET, never from the POST
    // response or a client-supplied code. A key alone cannot mark a payment paid.
    if(result.providerOrderId&&["pending","processing"].includes(order.state)){
      const resource=await input.provider.get(result.providerOrderId);
      if(resource?.id!==result.providerOrderId||
         resource.external_reference!==id||
         String(resource.user_id)!==String(order.collector)||
         Number(resource.total_amount)!==order.totalCents/100)
        throw new PixError("commercial_qr_provider_mismatch",409);
      const payments=resource.transactions?.payments;
      if(Array.isArray(payments)&&payments.length===1&&
         payments[0]?.payment_method?.id==="pix"&&
         payments[0]?.payment_method?.type==="bank_transfer"&&
         Number(payments[0]?.amount)===order.totalCents/100){
        const qr=payments[0]?.payment_method?.qr_code;
        const base64=payments[0]?.payment_method?.qr_code_base64;
        if(typeof qr==="string"&&qr.length<10000&&qr.length>0)
          result.qrCode=qr;
        if(typeof base64==="string"&&base64.length<500000&&
           /^[A-Za-z0-9+/=]+$/.test(base64))
          result.qrCodeBase64=base64;
      }
    }
    return result;
  }
  async function create(raw:Request,idempotencyKey:string){
    release();
    if(!KEY.test(idempotencyKey))
      throw new PixError("invalid_commercial_idempotency_key",400);
    const request=parse(raw);
    const merchant=await input.provider.me();
    if(merchant.netcraftTestAccount!==false||
       !/^[0-9]{1,24}$/.test(String(merchant.id)))
      throw new PixError("commercial_merchant_not_verified",503);
    const id=idFor(idempotencyKey);
    const requestHash=hash(request),ref=orders.doc(id),
      lease=crypto.randomBytes(16).toString("hex"),time=now();
    const result=await input.db.runTransaction(async(tx:any)=>{
      const prev=await tx.get(ref);
      if(prev.exists){
        const saved=prev.data();
        if(saved.environment!=="commercial"||saved.requestHash!==requestHash||
           saved.catalogValidated!==true||saved.collector!==String(merchant.id))
          throw new PixError("commercial_idempotency_conflict",409);
        if(saved.providerOrderId||saved.state!=="creating"||
           (Number.isFinite(saved.creationLeaseUntil)&&saved.creationLeaseUntil>time))
          return {shouldPost:false};
        tx.update(ref,{creationLease:lease,creationLeaseUntil:time+90_000});
        return {shouldPost:true};
      }
      tx.create(ref,{id,environment:"commercial",catalogValidated:true,
        checkoutOrigin:"netcraft_commercial_checkout_v1",
        requestHash,providerOrderId:null,collector:String(merchant.id),
        gamertag:request.gamertag,totalCents:request.totalCents,
        currency:"BRL",lines:request.lines,discountCents:0,
        state:"creating",dispatchEnabled:false,creationLease:lease,
        creationLeaseUntil:time+90_000,createdAt:new Date(time).toISOString()});
      return {shouldPost:true};
    });
    if(!result.shouldPost)return viewByCheckoutKey(idempotencyKey);
    release();
    const amount=(request.totalCents/100).toFixed(2);
    const providerRequest={type:"online",processing_mode:"automatic",
      external_reference:id,total_amount:amount,
      payer:{email:request.email},
      transactions:{payments:[{amount,payment_method:{
        id:"pix",type:"bank_transfer"}}]}};
    // Reuses the SAME idempotency key on crash/retry; no duplicate charge.
    const response=await input.provider.createPixOrder(providerRequest,id);
    if(!response||!ORDER.test(response.id||"")||
       response.external_reference!==id||response.type!=="online"||
       String(response.user_id)!==String(merchant.id)||
       Number(response.total_amount)!==request.totalCents/100)
      throw new PixError("commercial_provider_create_mismatch",409);
    await input.db.runTransaction(async(tx:any)=>{
      const binding=providerBindings.doc(response.id);
      const [current,existing]=await Promise.all([tx.get(ref),tx.get(binding)]);
      const saved=current.data();
      if(!saved||saved.requestHash!==requestHash||
         saved.collector!==String(merchant.id)||
         (saved.providerOrderId&&saved.providerOrderId!==response.id)||
         (!saved.providerOrderId&&saved.creationLease!==lease))
        throw new PixError("commercial_creation_state_conflict",409);
      if(existing.exists&&existing.data()?.orderId!==id)
        throw new PixError("commercial_provider_binding_conflict",409);
      if(!existing.exists)tx.create(binding,{orderId:id});
      tx.update(ref,{providerOrderId:response.id,state:"pending",
        creationLease:null,creationLeaseUntil:null,
        updatedAt:new Date(now()).toISOString()});
    });
    // POST response cannot authorize a reward; only a later verified GET can.
    return viewByCheckoutKey(idempotencyKey);
  }
  return Object.freeze({create,viewByCheckoutKey});
}
