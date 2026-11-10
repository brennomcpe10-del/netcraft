/**
 * Preview-only automatic VIP grant laboratory for an ISOLATED BDS clone.
 * Payment, commercial orders, delivery queues and official Core stay OFF.
 * The ONLY permitted source is a verified Preview pairing receipt + admin
 * request. The BDS must present a DISTINCT private clone-only bearer secret
 * and a one-use server nonce. The BDS clone is never a production entitlement.
 */
import crypto from "node:crypto";
import type {Firestore} from "firebase-admin/firestore";
import {NETCRAFT_VIP_TERMS} from "./netcraftVipCatalogApproval.ts";
import {NETCRAFT_PREVIEW_VIP_APPROVALS} from "./netcraftVipPreviewApproval.ts";

type DB=Pick<Firestore,"collection"|"runTransaction">;
const HEX=/^[a-f0-9]{64}$/, NONCE=/^[a-f0-9]{32}$/, MS=/^[0-9]{13}$/,
 NAME=/^[A-Za-z0-9_ ]{3,32}$/;
const TIERS=["explorer","elite","supreme"] as const;
type Tier=typeof TIERS[number];
const PROOF=15*60*1000,NONCE_TTL=60*1000,LEASE=90*1000;
const digest=(s:string)=>crypto.createHash("sha256").update(s).digest("hex");
const PRODUCT=new Map(NETCRAFT_PREVIEW_VIP_APPROVALS.map(x=>[x.tier,x.productId] as const));
const safeKeys=(x:any,keys:string[])=>x&&typeof x==="object"&&
  !Array.isArray(x)&&Object.keys(x).sort().join(",")===keys.slice().sort().join(",");
const validName=(s:unknown):s is string=>typeof s==="string"&&
  NAME.test(s)&&s.trim()===s;
export class PreviewCloneVipError extends Error{
  constructor(readonly reason:string){super(reason);}
}
export function createPreviewCloneVipAutoLab(input:{
  db:DB;cloneToken:string;now?:()=>number;
}){
  const {db,cloneToken}=input,now=input.now??Date.now;
  if(!db?.collection||!db?.runTransaction||
     !/^[A-Za-z0-9_-]{43,128}$/.test(cloneToken||""))
    throw new PreviewCloneVipError("clone_lab_private_config_required");
  const jobs=db.collection("previewCloneVipAutoV1Jobs");
  const slots=db.collection("previewCloneVipAutoV1Slots");
  const nonces=db.collection("previewCloneVipAutoV1Nonces");
  const receiptRef=(id:string)=>db.collection("previewDeliveryLinkLabV1Receipts").doc(id);
  const jobRef=(id:string)=>jobs.doc(id);
  const slotRef=(name:string)=>slots.doc(digest("preview-clone-slot/"+name.toLowerCase()));
  const nonceRef=(nonce:string)=>nonces.doc(digest("preview-clone-nonce/"+nonce));
  const validateProof=(record:any,time:number)=>record?.state==="verified_in_game"&&
    validName(record?.gamertag)&&HEX.test(record?.sessionDigest||"")&&
    Number.isSafeInteger(record.verifiedAt)&&
    (record.proofExpiresAt===undefined||
      record.proofExpiresAt===record.verifiedAt+PROOF)&&
    time>=record.verifiedAt&&time<record.verifiedAt+PROOF;
  const validSecret=(given:unknown)=>{
    if(typeof given!=="string"||!/^[A-Za-z0-9_-]{43,128}$/.test(given))return false;
    return crypto.timingSafeEqual(Buffer.from(digest(given),"hex"),
      Buffer.from(digest(cloneToken),"hex"));
  };
  const exposed=(record:any)=>({
    receiptId:record.receiptId,
    state:record.state,tier:record.tier,gamertag:record.gamertag,
    rankTag:record.rankTag,days:30 as const,
    createdAt:record.createdAt,offeredAt:record.offeredAt??null,
    acknowledgedAt:record.acknowledgedAt??null,
    reason:record.reason??null,
    simulation:true as const,cloneOnly:true as const,
    commercialDispatchEnabled:false as const,paymentsEnabled:false as const,
  });
  async function queue(body:unknown){
    if(!safeKeys(body,["receiptId","tier"]))
      throw new PreviewCloneVipError("invalid_clone_queue");
    const {receiptId,tier}=body as {receiptId:string;tier:Tier};
    if(!HEX.test(receiptId||"")||!TIERS.includes(tier))
      throw new PreviewCloneVipError("invalid_clone_queue");
    const terms=NETCRAFT_VIP_TERMS[tier],productId=PRODUCT.get(tier);
    if(!terms||!productId||terms.days!==30||terms.duration!=="30 dias")
      throw new PreviewCloneVipError("clone_vip_mapping_missing");
    const time=now(),ref=jobRef(receiptId);
    return db.runTransaction(async tx=>{
      const r=await tx.get(receiptRef(receiptId)),proof=r.data();
      if(!r.exists||!validateProof(proof,time))
        throw new PreviewCloneVipError("clone_link_proof_expired");
      const slot=slotRef(proof.gamertag);
      const [prior,active]=await Promise.all([tx.get(ref),tx.get(slot)]);
      if(prior.exists){
        if(prior.data()?.tier!==tier)
          throw new PreviewCloneVipError("clone_receipt_already_used");
        return exposed(prior.data());
      }
      if(active.exists&&active.data()?.receiptId!==receiptId){
        const other=await tx.get(jobRef(active.data()?.receiptId));
        if(other.exists&&other.data()?.state!=="acknowledged_clone")
          throw new PreviewCloneVipError("clone_player_has_unfinished_job");
      }
      const orderId=digest("netcraft-clone-only-not-paid/"+receiptId);
      const record={
        receiptId,gamertag:proof.gamertag,tier,productId,
        rankTag:terms.rankTag,days:30,
        id:orderId+"-0",orderId,
        state:"queued_clone",createdAt:time,
        simulation:true,cloneOnly:true,
        commercialDispatchEnabled:false,paymentsEnabled:false,
      };
      tx.create(ref,record);
      tx.set(slot,{receiptId,gamertag:proof.gamertag});
      return exposed(record);
    });
  }
  async function status(id:string){
    if(!HEX.test(id||""))throw new PreviewCloneVipError("invalid_clone_receipt");
    const snap=await jobRef(id).get();
    if(!snap.exists)return {state:"not_queued" as const,
      simulation:true as const,commercialDispatchEnabled:false as const};
    return exposed(snap.data());
  }
  async function challenge(body:unknown,token:unknown){
    if(!validSecret(token))throw new PreviewCloneVipError("clone_bds_unauthorized");
    if(!safeKeys(body,["schema"])||(body as any).schema!==1)
      throw new PreviewCloneVipError("invalid_clone_challenge");
    const time=now(),nonce=crypto.randomBytes(16).toString("hex");
    await nonceRef(nonce).create({issuedAt:time,expiresAt:time+NONCE_TTL,
      state:"issued"});
    return {schema:1 as const,nonce,timestamp:String(time),
      cloneOnly:true as const,simulation:true as const,
      commercialDispatchEnabled:false as const,paymentsEnabled:false as const};
  }
  async function authenticate(token:unknown,nonce:unknown,timestamp:unknown){
    if(!validSecret(token))throw new PreviewCloneVipError("clone_bds_unauthorized");
    if(typeof nonce!=="string"||!NONCE.test(nonce)||
       typeof timestamp!=="string"||!MS.test(timestamp)||
       Math.abs(now()-Number(timestamp))>NONCE_TTL)
      throw new PreviewCloneVipError("clone_challenge_invalid");
    const ref=nonceRef(nonce),time=now();
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref),data=snap.data();
      if(!snap.exists||data?.state!=="issued"||
         data.issuedAt!==Number(timestamp)||time<data.issuedAt||
         time>=data.expiresAt)
        throw new PreviewCloneVipError("clone_challenge_replayed");
      tx.update(ref,{state:"consumed",usedAt:time});
    });
  }
  async function poll(body:unknown){
    if(!safeKeys(body,["gamertag","sessionId"])||
       !validName((body as any).gamertag)||
       typeof (body as any).sessionId!=="string"||
       !/^[A-Za-z0-9_:\-.]{1,128}$/.test((body as any).sessionId))
      throw new PreviewCloneVipError("invalid_clone_poll");
    const {gamertag,sessionId}=body as {gamertag:string;sessionId:string};
    const time=now();
    return db.runTransaction(async tx=>{
      const slot=await tx.get(slotRef(gamertag)),id=slot.data()?.receiptId;
      const empty={schema:1 as const,simulation:true as const,
        cloneOnly:true as const,commercialDispatchEnabled:false as const,
        paymentsEnabled:false as const,offer:null as any};
      if(!slot.exists||!HEX.test(id||""))return empty;
      const ref=jobRef(id),snap=await tx.get(ref),record=snap.data();
      if(!snap.exists||record.gamertag!==gamertag)return empty;
      if(record.state==="offered_clone"&&time>=record.leaseExpiresAt){
        tx.update(ref,{state:"manual_review",reason:"clone_lease_timeout"});
        return empty;
      }
      if(record.state!=="queued_clone")return empty;
      // Preview pairing was a real in-game confirmation, but the clone has
      // its own session. Only this dedicated authenticated clone may receive
      // a fake test job, and the clone session is pinned at the first offer.
      const receipt=await tx.get(receiptRef(id));
      if(!receipt.exists||!validateProof(receipt.data(),time)||
         receipt.data()?.gamertag!==gamertag)return empty;
      const leaseToken=crypto.randomBytes(16).toString("hex");
      tx.update(ref,{state:"offered_clone",sessionDigest:digest(sessionId),
        leaseDigest:digest(leaseToken),offeredAt:time,
        leaseExpiresAt:time+LEASE});
      return {...empty,offer:{
        receiptId:id,leaseToken,
        payload:{contract:"netcraft.delivery.v1" as const,
          id:record.id,orderId:record.orderId,gamertag,
          kind:"vip" as const,rankTag:record.rankTag,days:30 as const},
      }};
    });
  }
  async function finish(body:unknown,ack:boolean){
    if(!safeKeys(body,["receiptId","leaseToken","gamertag","sessionId","result"]))
      throw new PreviewCloneVipError("invalid_clone_finish");
    const {receiptId,leaseToken,gamertag,sessionId,result}=body as any;
    if(!HEX.test(receiptId||"")||!NONCE.test(leaseToken||"")||
       !validName(gamertag)||
       typeof sessionId!=="string"||
       !/^[A-Za-z0-9_:\-.]{1,128}$/.test(sessionId)||
       (ack?!["applied","already_applied"].includes(result):
         !["manual_review","vip_not_configured","identity_unverified",
           "player_offline","vip_upgrade_review_required"].includes(result)))
      throw new PreviewCloneVipError("invalid_clone_finish");
    return db.runTransaction(async tx=>{
      const ref=jobRef(receiptId),snap=await tx.get(ref),record=snap.data();
      if(!snap.exists||record?.gamertag!==gamertag||
         record?.leaseDigest!==digest(leaseToken)||
         record?.sessionDigest!==digest(sessionId))
        throw new PreviewCloneVipError("clone_lease_mismatch");
      if(record.state==="acknowledged_clone"&&ack)
        return {status:"acknowledged_clone" as const,duplicate:true as const};
      if(!["offered_clone","manual_review"].includes(record.state))
        throw new PreviewCloneVipError("clone_lease_not_active");
      const state=ack?"acknowledged_clone":"manual_review";
      tx.update(ref,{state,reason:ack?null:result,
        acknowledgedAt:ack?now():null});
      return {status:state,duplicate:false,
        simulation:true as const,commercialDispatchEnabled:false as const};
    });
  }
  return Object.freeze({queue,status,challenge,authenticate,poll,
    ack:(body:unknown)=>finish(body,true),
    nack:(body:unknown)=>finish(body,false)});
}
