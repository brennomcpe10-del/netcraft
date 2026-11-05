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
  async function view(id:string){
    if(!/^[a-f0-9]{64}$/.test(id))throw new PixError("invalid_order_id",400);
    const order=(await orders.doc(id).get()).data();
    if(!order)return {id,status:"not_found" as const};
    return {id,state:order.state,providerOrderId:order.providerOrderId??null,
      totalCents:order.totalCents,currency:"BRL" as const};
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
    const id=crypto.createHash("sha256")
      .update("netcraft-commercial-v1:"+idempotencyKey).digest("hex");
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
        requestHash,providerOrderId:null,collector:String(merchant.id),
        gamertag:request.gamertag,totalCents:request.totalCents,
        currency:"BRL",lines:request.lines,discountCents:0,
        state:"creating",dispatchEnabled:false,creationLease:lease,
        creationLeaseUntil:time+90_000,createdAt:new Date(time).toISOString()});
      return {shouldPost:true};
    });
    if(!result.shouldPost)return view(id);
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
    return view(id);
  }
  return Object.freeze({create,view});
}
