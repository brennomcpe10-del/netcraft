/**
 * Remote BDS transport preflight for the NetCraftBR Vercel PREVIEW only.
 *
 * This is NOT a delivery gateway: no credentials, orders, Firestore, payment
 * checks, queue, grants, ACK or secrets are processed here. The BDS may prove
 * HTTPS GET + JSON POST compatibility with the specific NetCraft backend.
 * On Vercel Production and all non-Preview deployments, return 503.
 */
import express from "express";

const CONTRACT="netcraft.delivery.remote-preflight.v1";
const BODY=Object.freeze({schema:1,probe:CONTRACT});
const MAX_BODY_BYTES=256;
const response=()=>({
  schema:1 as const,
  contract:CONTRACT,
  environment:"preview" as const,
  simulation:true as const,
  transport:"https" as const,
  dispatchEnabled:false as const,
  grantsEnabled:false as const,
  ackEnabled:false as const,
  realPayments:false as const,
});

export const deliveryMagnoPreflightRouter=express.Router();
deliveryMagnoPreflightRouter.use((req,res,next)=>{
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  if(process.env.VERCEL_ENV!=="preview")
    return res.status(503).json({error:"remote_preflight_off"});
  // This diagnostic is not authenticated and MUST remain read-only/inert.
  // It must never dispatch a job, even if a hostile caller sends a token.
  if("authorization" in req.headers ||
     "x-nc-bds-token" in req.headers ||
     "x-nc-signature" in req.headers)
    return res.status(400).json({error:"credentials_not_accepted"});
  next();
});
deliveryMagnoPreflightRouter.get("/health",(req,res)=>{
  if(Object.keys(req.query).length!==0)
    return res.status(400).json({error:"unexpected_query"});
  return res.status(200).json(response());
});
deliveryMagnoPreflightRouter.post("/ping",
  express.text({type:"application/json",limit:MAX_BODY_BYTES}),
  (req,res)=>{
    if(Object.keys(req.query).length!==0)
      return res.status(400).json({error:"unexpected_query"});
    const raw=typeof req.body==="string"
      ?req.body:typeof req.body==="object"&&req.body!==null
        ?JSON.stringify(req.body):"";
    if(Buffer.byteLength(raw,"utf8")>MAX_BODY_BYTES ||
       raw!==JSON.stringify(BODY))
      return res.status(400).json({error:"invalid_preflight_body"});
    // No echo of request data or sensitive headers.
    return res.status(200).json({...response(),pingAccepted:true as const});
  },
);
deliveryMagnoPreflightRouter.all("*",(_req,res)=>
  res.status(405).json({error:"preflight_method_not_allowed"}));
