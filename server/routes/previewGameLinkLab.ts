/**
 * Preview-only test pairing routes. These routes do NOT create payment records,
 * delivery jobs, VIPs or ACKs. All persistence uses dedicated
 * previewDeliveryLinkLabV1* collections, never existing order collections.
 */
import express from "express";
import {requireAdmin} from "../auth/admin.ts";
import {paymentDatabase} from "../payments/database.ts";
import {createPreviewGameLinkLab,PreviewGameLinkError}
  from "../delivery/previewGameLinkLab.ts";

const PREVIEW_BRANCH="redesign-mobile-solaris";
function allowed(){
  return process.env.VERCEL_ENV==="preview" &&
    process.env.VERCEL_GIT_COMMIT_REF===PREVIEW_BRANCH &&
    process.env.NCBR_PREVIEW_GAME_LINK_LAB_ENABLED==="true" &&
    typeof process.env.NCBR_PREVIEW_BDS_LINK_TOKEN==="string" &&
    /^[A-Za-z0-9_-]{43,128}$/.test(process.env.NCBR_PREVIEW_BDS_LINK_TOKEN);
}
function lab(){
  if(!allowed())throw new PreviewGameLinkError("preview_lab_disabled");
  return createPreviewGameLinkLab({
    db:paymentDatabase(),token:process.env.NCBR_PREVIEW_BDS_LINK_TOKEN!,
  });
}
const noCache=(_req:express.Request,res:express.Response,next:express.NextFunction)=>{
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  next();
};
const unavailable=(res:express.Response,error:unknown)=>{
  const why=error instanceof PreviewGameLinkError?error.reason:"lab_unavailable";
  const code=why==="unauthorized_bds"?401:
    why==="invalid_challenge"||why==="invalid_game_link_body"||
    why==="invalid_gamertag"||why==="invalid_lab_receipt"?400:
    why==="existing_lab_code_active"||why==="lab_code_rate_limited"||
    why==="invalid_or_expired_lab_code"||why==="challenge_expired_or_replayed"?409:
    why==="lab_receipt_not_found"?404:503;
  // Never echo game input, vouchers, service accounts or secrets.
  return res.status(code).json({error:why});
};
export const previewGameLinkLabAdminRouter=express.Router();
previewGameLinkLabAdminRouter.use(noCache);
previewGameLinkLabAdminRouter.use((_req,res,next)=>{
  if(!allowed())return res.status(503).json({error:"preview_lab_disabled"});
  next();
});
previewGameLinkLabAdminRouter.post("/issue",requireAdmin,async(req,res)=>{
  try{
    if(!req.body||typeof req.body!=="object"||
       Array.isArray(req.body)||Object.keys(req.body).length!==1)
      return res.status(400).json({error:"invalid_lab_issue"});
    return res.status(201).json(await lab().issue(req.body.gamertag));
  }catch(e){return unavailable(res,e);}
});
previewGameLinkLabAdminRouter.get("/status/:id",requireAdmin,async(req,res)=>{
  try{return res.json(await lab().status(req.params.id));}
  catch(e){return unavailable(res,e);}
});
previewGameLinkLabAdminRouter.get("/health",requireAdmin,(_req,res)=>
  res.json({environment:"preview",status:"LAB_LINK_ONLY",
    isolation:"previewDeliveryLinkLabV1",grantsEnabled:false,
    paymentsEnabled:false,deliveryDispatchEnabled:false}));

export const previewGameLinkLabBdsRouter=express.Router();
previewGameLinkLabBdsRouter.use(noCache);
previewGameLinkLabBdsRouter.use((_req,res,next)=>{
  // In Production or when disabled, the unrelated commercial private router
  // remains exclusively responsible for /api/delivery/bds.
  if(!allowed())return next("router");
  next();
});
function privateTLS(req:express.Request){
  // Vercel's trusted edge sets X-Forwarded-Proto; it terminates HTTPS.
  // Does not authorize the caller by itself: token+one-time nonce still needed.
  return req.headers["x-forwarded-proto"]==="https" &&
    !Array.isArray(req.headers["x-forwarded-proto"]);
}
previewGameLinkLabBdsRouter.post("/challenge",async(req,res)=>{
  if(!privateTLS(req))
    return res.status(403).json({error:"preview_https_required"});
  try {
    const token=req.headers["x-nc-bds-token"];
    if(typeof token!=="string"||Array.isArray(token))
      return res.status(401).json({error:"unauthorized_bds"});
    return res.status(200).json(await lab().challenge(req.body,token));
  }catch(e){return unavailable(res,e);}
});
previewGameLinkLabBdsRouter.post("/link",async(req,res)=>{
  if(!privateTLS(req))
    return res.status(403).json({error:"preview_https_required"});
  try{
    const token=req.headers["x-nc-bds-token"],
      nonce=req.headers["x-nc-nonce"],timestamp=req.headers["x-nc-timestamp"];
    if(typeof token!=="string"||typeof nonce!=="string"||
       typeof timestamp!=="string"||Array.isArray(token)||Array.isArray(nonce)||
       Array.isArray(timestamp))
      return res.status(401).json({error:"unauthorized_bds"});
    return res.status(200).json(await lab().link(req.body,
      {token,nonce,timestamp}));
  }catch(e){return unavailable(res,e);}
});
// Intentionally NO poll, ack, nack, queue or grant endpoint in Preview.
