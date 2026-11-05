/**
 * Commercial Pix + BDS routes. They are DISABLED on all Preview and LAB
 * deployments. Production activation additionally requires isolated Firebase,
 * a live merchant, exact approved catalog and private BDS credentials.
 * Never accept an order's status from a webhook body as proof of payment.
 */
import express from "express";
import crypto from "node:crypto";
import {PixError,webhookSignature} from "../payments/mercadoPago.ts";
import {claimWebhook,completeWebhook,releaseWebhook}
  from "../payments/webhookReplay.ts";
import {createReviewedCommercialVercelRuntime}
  from "../delivery/commercialVercelRuntime.ts";

const ID=/^[a-f0-9]{64}$/;
const KEY=/^[A-Za-z0-9-]{20,80}$/;
const ORDER=/^ORD[A-Z0-9]{20,40}$/;
const REQUEST=/^[A-Za-z0-9-]{1,128}$/;
const COLLECTION="pixCommercialWebhookReceipts";
const enabled=()=>process.env.NODE_ENV==="production" &&
  process.env.VERCEL_ENV==="production" &&
  process.env.NETCRAFT_DELIVERY_RELEASE_APPROVED==="PRIVATE_GATEWAY_REVIEWED" &&
  process.env.NCBR_COMMERCIAL_CHECKOUT_APPROVED==="REVIEWED_LIVE_PIX";
const error=(res:express.Response,err:unknown)=>{
  const code=err instanceof PixError?err.status:503;
  return res.status(code).json({error:"commercial_operation_unavailable"});
};
export const commercialPixReleaseRouter=express.Router();
commercialPixReleaseRouter.use((_req,res,next)=>{
  res.setHeader("Cache-Control","no-store");
  // Do not intercept the existing 503 release boundary in Preview/LAB.
  if(!enabled())return next("router");
  next();
});
commercialPixReleaseRouter.get("/config",(_req,res)=>{
  try{
    createReviewedCommercialVercelRuntime();
    return res.json({available:true,environment:"commercial",
      realPayments:true,minecraftDispatchConfigured:true});
  }catch(e){return error(res,e);}
});
commercialPixReleaseRouter.post("/orders",async(req,res)=>{
  try{
    const runtime=createReviewedCommercialVercelRuntime();
    const key=String(req.headers["idempotency-key"]||"");
    const result=await runtime.checkout.create(req.body,key);
    return res.status(201).json(result);
  }catch(e){return error(res,e);}
});
commercialPixReleaseRouter.get("/orders/:id",async(req,res)=>{
  try{
    const key=String(req.headers["x-checkout-key"]||"");
    if(!KEY.test(key)||!ID.test(req.params.id)||
       crypto.createHash("sha256").update("netcraft-commercial-v1:"+key)
         .digest("hex")!==req.params.id)
      return res.status(401).json({error:"buyer_checkout_key_required"});
    const runtime=createReviewedCommercialVercelRuntime();
    return res.json(await runtime.checkout.viewByCheckoutKey(key));
  }catch(e){return error(res,e);}
});
commercialPixReleaseRouter.post("/webhook",async(req,res)=>{
  try{
    const runtime=createReviewedCommercialVercelRuntime();
    const providerId=String(req.query["data.id"]||"");
    const requestId=String(req.headers["x-request-id"]||"");
    const signature=String(req.headers["x-signature"]||"");
    const topic=String(req.query.type||req.body?.type||"");
    const secret=process.env.MERCADOPAGO_WEBHOOK_SECRET||"";
    if(!ORDER.test(providerId)||!REQUEST.test(requestId)||
       !["order","orders"].includes(topic)||
       (req.body?.data?.id&&String(req.body.data.id)!==providerId)||
       !webhookSignature(providerId,requestId,signature,secret))
      return res.status(401).json({error:"unverified_commercial_notification"});
    const claim=await claimWebhook(runtime.db,providerId,requestId,signature,
      Date.now(),COLLECTION);
    if(claim.status==="duplicate")return res.sendStatus(200);
    if(claim.status==="busy")return res.status(503).json({error:"notification_retry_required"});
    try{
      await runtime.delivery.reconcileSignedOrderNotification({
        orderId:providerId,requestId,signature,type:topic,
      });
      await completeWebhook(runtime.db,claim,COLLECTION);
      return res.sendStatus(200);
    }catch(e){
      await releaseWebhook(runtime.db,claim,COLLECTION);
      throw e;
    }
  }catch(e){return error(res,e);}
});

export const commercialBdsReleaseRouter=express.Router();
commercialBdsReleaseRouter.use(async(req,res,next)=>{
  res.setHeader("Cache-Control","no-store");
  if(!enabled())return res.status(503).json({error:"delivery_release_off"});
  try{
    const runtime=createReviewedCommercialVercelRuntime();
    return runtime.delivery.router(req,res,next);
  }catch(e){return error(res,e);}
});
