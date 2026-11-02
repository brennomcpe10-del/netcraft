import crypto from "node:crypto";
import type {Firestore} from "firebase-admin/firestore";
import {Timestamp} from "firebase-admin/firestore";
// Transactions must be durable across Vercel workers. Never trust the provider
// body to authorize grants; only signed notifications trigger a fresh GET.
const COLLECTION="pixTestWebhookReceipts";
const LOCK_MS=90000;
export type ClaimResult={status:"acquired"|"duplicate"|"busy";key:string;lease:string};
export function webhookReplayKey(providerId:string,requestId:string,signature:string){
 if(!/^ORD[A-Z0-9]{20,40}$/.test(providerId) ||
    !/^[A-Za-z0-9-]{1,128}$/.test(requestId)||
    !/^ts=\d{10,13},v1=[a-fA-F0-9]{64}$/.test(signature.replace(/\s+/g,"")))
  throw Error("webhook_replay_input_invalid");
 return crypto.createHash("sha256")
  .update([providerId,requestId,signature.replace(/\s+/g,"")].join("\0"))
  .digest("hex");
}
export async function claimWebhook(
 db:Firestore,providerId:string,requestId:string,signature:string,
 now=Date.now(),
):Promise<ClaimResult>{
 const key=webhookReplayKey(providerId,requestId,signature);
 const ref=db.collection(COLLECTION).doc(key);
 const lease=crypto.randomBytes(16).toString("hex");
 return db.runTransaction(async tx=>{
  const snap=await tx.get(ref),state=snap.data();
  if(state?.state==="done")return {status:"duplicate",key,lease:""};
  if(state?.state==="working" &&
     Number.isFinite(state.claimedAt)&&now-state.claimedAt<LOCK_MS &&
     now>=state.claimedAt)return {status:"busy",key,lease:""};
  tx.set(ref,{
   state:"working",providerId,claimedAt:now,lease,
   expiresAt:Timestamp.fromMillis(now+48*60*60*1000),
  });
  return {status:"acquired",key,lease};
 });
}
export async function completeWebhook(db:Firestore,claim:ClaimResult){
 if(claim.status!=="acquired")return;
 const ref=db.collection(COLLECTION).doc(claim.key);
 await db.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(snap.data()?.lease!==claim.lease ||snap.data()?.state!=="working")
   throw Error("webhook_claim_lost");
  tx.update(ref,{state:"done",completedAt:Date.now(),lease:null});
 });
}
export async function releaseWebhook(db:Firestore,claim:ClaimResult){
 if(claim.status!=="acquired")return;
 const ref=db.collection(COLLECTION).doc(claim.key);
 await db.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(snap.data()?.lease===claim.lease &&snap.data()?.state==="working")
   tx.delete(ref);
 });
}
