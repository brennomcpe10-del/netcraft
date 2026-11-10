/**
 * Preview ONLY automatic test VIP bridge to an isolated BDS clone.
 * These endpoints can NEVER route to real commercial order collections,
 * existing Mundo Eterno, Pix, Production, or commercial delivery pumps.
 */
import express from "express";
import {requireAdmin} from "../auth/admin.ts";
import {paymentDatabase} from "../payments/database.ts";
import {createPreviewCloneVipAutoLab,PreviewCloneVipError}
  from "../delivery/previewCloneVipAutoLab.ts";

function allowed(){
  return process.env.VERCEL_ENV==="preview"&&
    process.env.VERCEL_GIT_COMMIT_REF==="redesign-mobile-solaris"&&
    process.env.NCBR_PREVIEW_GAME_LINK_LAB_ENABLED==="true"&&
    process.env.NCBR_PREVIEW_CLONE_AUTO_ENABLED==="true"&&
    /^[A-Za-z0-9_-]{43,128}$/.test(
      process.env.NCBR_PREVIEW_CLONE_BDS_TOKEN||"");
}
function service(){
  if(!allowed())throw new PreviewCloneVipError("clone_lab_disabled");
  return createPreviewCloneVipAutoLab({
    db:paymentDatabase(),cloneToken:process.env.NCBR_PREVIEW_CLONE_BDS_TOKEN!,
  });
}
const noCache=(_req:express.Request,res:express.Response,next:express.NextFunction)=>{
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  next();
};
function error(res:express.Response,e:unknown){
  const reason=e instanceof PreviewCloneVipError?e.reason:"clone_lab_unavailable";
  const status=reason==="clone_bds_unauthorized"?401:
    reason==="invalid_clone_challenge"||reason==="invalid_clone_poll"||
    reason==="invalid_clone_finish"||reason==="invalid_clone_queue"||
    reason==="invalid_clone_receipt"?400:
    reason==="clone_challenge_replayed"||reason==="clone_challenge_invalid"||
    reason==="clone_lease_mismatch"||reason==="clone_lease_not_active"||
    reason==="clone_link_proof_expired"||reason==="clone_receipt_already_used"||
    reason==="clone_player_has_unfinished_job"?409:503;
  return res.status(status).json({error:reason});
}
export const previewCloneVipAdminRouter=express.Router();
previewCloneVipAdminRouter.use(noCache);
previewCloneVipAdminRouter.use((_req,res,next)=>{
  if(!allowed())return res.status(503).json({error:"clone_lab_disabled"});
  next();
});
previewCloneVipAdminRouter.post("/queue",requireAdmin,async(req,res)=>{
  try{return res.status(201).json(await service().queue(req.body));}
  catch(e){return error(res,e);}
});
previewCloneVipAdminRouter.get("/status/:id",requireAdmin,async(req,res)=>{
  try{return res.json(await service().status(req.params.id));}
  catch(e){return error(res,e);}
});
previewCloneVipAdminRouter.get("/health",requireAdmin,(_req,res)=>
  res.json({mode:"PREVIEW_CLONE_ONLY",cloneOnly:true,
    commercialDispatchEnabled:false,paymentsEnabled:false}));
export const previewCloneVipBdsRouter=express.Router();
previewCloneVipBdsRouter.use(noCache);
previewCloneVipBdsRouter.use((req,res,next)=>{
  if(!allowed())return res.status(503).json({error:"clone_lab_disabled"});
  if(req.headers["x-forwarded-proto"]!=="https")
    return res.status(403).json({error:"clone_https_required"});
  next();
});
function header(req:express.Request,key:string){
  const v=req.headers[key];
  return typeof v==="string"?v:undefined;
}
previewCloneVipBdsRouter.post("/challenge",async(req,res)=>{
  try{return res.json(await service().challenge(req.body,
    header(req,"x-nc-clone-token")));}
  catch(e){return error(res,e);}
});
function bdsAction(method:"poll"|"ack"|"nack"){
  return async(req:express.Request,res:express.Response)=>{
    try{
      const lab=service();
      await lab.authenticate(header(req,"x-nc-clone-token"),
        header(req,"x-nc-nonce"),header(req,"x-nc-timestamp"));
      return res.json(await lab[method](req.body));
    }catch(e){return error(res,e);}
  };
}
previewCloneVipBdsRouter.post("/poll",bdsAction("poll"));
previewCloneVipBdsRouter.post("/ack",bdsAction("ack"));
previewCloneVipBdsRouter.post("/nack",bdsAction("nack"));
