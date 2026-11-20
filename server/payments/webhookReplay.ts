import crypto from "node:crypto";
import type {Firestore} from "firebase-admin/firestore";
import {Timestamp} from "firebase-admin/firestore";
// Transactions must be durable across Vercel workers. Never trust the provider
// body to authorize grants; only signed notifications trigger a fresh GET.
const COLLECTION="pixTestWebhookReceipts";
const COMMERCIAL_COLLECTION="pixCommercialWebhookReceipts";
const approvedCollection=(c:string)=>{
 if(c!==COLLECTION&&c!==COMMERCIAL_COLLECTION)
   throw Error("invalid_webhook_receipt_collection");
 return c;
};
const LOCK_MS=90000;
// Same-instance single-flight is defense-in-depth for the Firestore Emulator.
// It is NOT our cross-worker lock: the unique Firestore create/transaction
// below remains mandatory across Vercel workers and BDS gateway processes.
const localClaims=new Map<string,Promise<void>>();
async function withLocalClaimLock<T>(key:string,fn:()=>Promise<T>):Promise<T>{
 const previous=localClaims.get(key);
 let release:()=>void=()=>{};
 const mine=new Promise<void>(resolve=>{release=resolve;});
 localClaims.set(key,mine);
 try{
  if(previous)await previous;
  return await fn();
 }finally{
  if(localClaims.get(key)===mine)localClaims.delete(key);
  release();
 }
}
export type ClaimResult={status:"acquired"|"duplicate"|"busy";key:string;lease:string};
export function webhookReplayKey(providerId:string,requestId:string,signature:string){
 const parsed=/^ts=(\d{10}|\d{13}),\s*v1=([a-f0-9]{64})$/i.exec(signature);
 if(!(/^(?:ORD[A-Z0-9]{20,40}|[0-9]{1,30})$/.test(providerId)) ||
    !/^[A-Za-z0-9-]{1,128}$/.test(requestId)||!parsed)
  throw Error("webhook_replay_input_invalid");
 return crypto.createHash("sha256")
  .update([providerId,requestId,parsed[1],parsed[2].toLowerCase()].join("\0"))
  .digest("hex");
}
export async function claimWebhook(
 db:Firestore,providerId:string,requestId:string,signature:string,
 now=Date.now(),collection=COLLECTION,
):Promise<ClaimResult>{
 const key=webhookReplayKey(providerId,requestId,signature);
 const ref=db.collection(approvedCollection(collection)).doc(key);
 return withLocalClaimLock(key,async()=>{
 const lease=crypto.randomBytes(16).toString("hex");
 const next={
  state:"working",providerId,claimedAt:now,lease,
  expiresAt:Timestamp.fromMillis(now+48*60*60*1000),
 };
 // First claimant uses an atomic Firestore CREATE, never an optimistic
 // missing-document read. On highly concurrent emulator/server requests,
 // two read-then-create transactions can both appear to have acquired a
 // previously nonexistent receipt. Server-side create is a unique-key fence.
 try{
  await ref.create(next);
  return {status:"acquired" as const,key,lease};
 }catch(error:any){
  // Distinguish a genuine duplicate from outages and permission failures.
  if(error?.code!==6 && error?.code!=="already-exists")throw error;
 }
 // An existing receipt must still be checked transactionally: done stays
 // immutable, active worker stays busy, and ONLY an expired worker is reclaimed.
 return db.runTransaction(async tx=>{
  const snap=await tx.get(ref),state=snap.data();
  if(!snap.exists)throw Error("webhook_claim_state_unavailable");
  if(state?.state==="done")return {status:"duplicate" as const,key,lease:""};
  if(state?.state==="working" &&
     (!Number.isFinite(state.claimedAt)||now-state.claimedAt<LOCK_MS))
    return {status:"busy" as const,key,lease:""};
  tx.update(ref,next);
  return {status:"acquired" as const,key,lease};
 });
 });
}
export async function completeWebhook(db:Firestore,claim:ClaimResult,collection=COLLECTION){
 if(claim.status!=="acquired")return;
 const ref=db.collection(approvedCollection(collection)).doc(claim.key);
 await db.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(snap.data()?.lease!==claim.lease ||snap.data()?.state!=="working")
   throw Error("webhook_claim_lost");
  tx.update(ref,{state:"done",completedAt:Date.now(),lease:null});
 });
}
export async function releaseWebhook(db:Firestore,claim:ClaimResult,collection=COLLECTION){
 if(claim.status!=="acquired")return;
 const ref=db.collection(approvedCollection(collection)).doc(claim.key);
 await db.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(snap.data()?.lease===claim.lease &&snap.data()?.state==="working")
   tx.delete(ref);
 });
}
