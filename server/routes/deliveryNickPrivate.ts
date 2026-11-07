/**
 * UNMOUNTED private TLS BDS ingress for commercial nick delivery.
 * Only an explicitly reviewed HTTPS listener or Vercel Production edge with
 * authenticated server-to-server traffic; never mount in Preview.
 * The production provider reader, Firestore and approved registry are injected
 * by an independently reviewed deployment, never by HTTP request data.
 */
import express from "express";
import type {Request,Response} from "express";
import type {Firestore} from "firebase-admin/firestore";
import {
  createOpaqueBdsNickReleaseAdapter,issuePersistedPrivateBdsChallenge,OpaqueNickBridgeBlocked,
  type NickBridgeService,
} from "../delivery/bdsOpaqueNickReleaseAdapter.ts";
const allowed=new Set(["poll","ack","nack"]);

export function createBdsNickPrivateRouter(opts:{
  service:NickBridgeService;
  secret:string;hmacKey:string;now?:()=>number;
  db:Pick<Firestore,"collection">;
}){
  const router=express.Router();
  const adapter=createOpaqueBdsNickReleaseAdapter(opts);
  router.use((req,res,next)=>{
    res.setHeader("Cache-Control","no-store");
    // In a dedicated Node HTTPS listener the socket is TLS. In Vercel
    // Production the HTTPS edge terminates TLS before this function; require
    // its HTTPS forwarded protocol plus a server-side VERCEL_ENV gate.
    // Untrusted Preview, HTTP and local proxies remain blocked.
    const directTLS=(req.socket as any).encrypted===true &&
      !req.headers["x-forwarded-for"]&&!req.headers["x-forwarded-proto"];
    const vercelTLS=process.env.VERCEL_ENV==="production" &&
      req.headers["x-forwarded-proto"]==="https";
    if(!directTLS&&!vercelTLS)
      return res.status(403).json({error:"private_tls_required"});
    next();
  });
  // POST /challenge returns a server-generated nonce only after private TLS
  // and authenticated SecretString. No queue access, lease or grant occurs.
  router.post("/challenge",express.text({type:"application/json",limit:"128b"}),
    async(req:Request,res:Response)=>{
      const token=req.headers["x-nc-bds-token"];
      const body=typeof req.body==="string"?req.body:
        req.body&&typeof req.body==="object"?JSON.stringify(req.body):"";
      try {
        const challenge=await issuePersistedPrivateBdsChallenge({
          method:req.method,transportVerified:true,body,
          receivedToken:typeof token==="string"?token:undefined,
          secret:opts.secret,now:opts.now,db:opts.db,
        });
        return res.status(200).json(challenge);
      }catch(error){
        if(error instanceof OpaqueNickBridgeBlocked)
          return res.status(error.reason==="unauthorized_bds_request"?401:403)
            .json({error:error.reason});
        return res.status(503).json({error:"delivery_unavailable"});
      }
    },
  );
  router.post("/:action",express.text({type:"application/json",limit:"4kb"}),
    async(req:Request,res:Response)=>{
      if(!allowed.has(req.params.action))
        return res.status(404).json({error:"not_found"});
      const body=typeof req.body==="string"?req.body:
        req.body&&typeof req.body==="object"?JSON.stringify(req.body):"";
      try{
        const result=await adapter({
          method:req.method,action:req.params.action,
          transportVerified:true,body,
          headers:{
            "x-nc-bds-token":Array.isArray(req.headers["x-nc-bds-token"])
              ?undefined:req.headers["x-nc-bds-token"],
            "x-nc-nonce":Array.isArray(req.headers["x-nc-nonce"])
              ?undefined:req.headers["x-nc-nonce"],
            "x-nc-timestamp":Array.isArray(req.headers["x-nc-timestamp"])
              ?undefined:req.headers["x-nc-timestamp"],
          },
        });
        return res.status(200).json(result);
      }catch(error:any){
        if(error instanceof OpaqueNickBridgeBlocked)
          return res.status(error.reason==="unauthorized_bds_request"?401:403)
            .json({error:error.reason});
        if(error?.code==="replayed_request")
          return res.status(409).json({error:"replayed_request"});
        // No sensitive payload, customer identity or keys in response/log.
        return res.status(503).json({error:"delivery_unavailable"});
      }
    },
  );
  return router;
}
