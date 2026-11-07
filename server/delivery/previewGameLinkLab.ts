/**
 * PREVIEW-ONLY in-game link handshake. No paid orders, no queues, no items,
 * no delivery ACK, no rank grants and no access to commercial collections.
 * Documents live only in new previewDeliveryLinkLabV1* namespaces.
 *
 * The code is a short-lived, one-use fake order proof. The BDS must present
 * a dedicated, opaque SecretString header and consume a server-issued nonce.
 * This is NOT an authenticated permanent Xbox account link.
 */
import crypto from "node:crypto";
import type {Firestore} from "firebase-admin/firestore";

type DB=Pick<Firestore,"collection"|"runTransaction">;
const NAME=/^[A-Za-z0-9_ ]{3,32}$/;
const SESSION=/^[A-Za-z0-9_:\-.]{1,128}$/;
const CODE=/^NC-[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/;
const NONCE=/^[a-f0-9]{32}$/;
const TIMESTAMP=/^[0-9]{13}$/;
const ID=/^[a-f0-9]{64}$/;
const ALPHABET="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TTL_MS=600000, CHALLENGE_MS=60000, WINDOW_MS=86400000;
const MAX_CODES=5;
const collectionPrefix="previewDeliveryLinkLabV1";
const codeFactory=()=>{
  const bytes=crypto.randomBytes(16);
  let str="";
  for(const b of bytes)str+=ALPHABET[b&31];
  return "NC-"+str.match(/.{4}/g)!.join("-");
};
function goodName(name:unknown):name is string{
  return typeof name==="string" && NAME.test(name) && name.trim()===name;
}
function digest(data:string){
  return crypto.createHash("sha256").update(data).digest("hex");
}
export class PreviewGameLinkError extends Error {
  constructor(readonly reason:string){super(reason);}
}
export function createPreviewGameLinkLab(input:{
  db:DB;token:string;now?:()=>number;
}){
  const {db,token}=input;
  if(!db?.collection||!db?.runTransaction ||
     typeof token!=="string"|| !/^[A-Za-z0-9_-]{43,128}$/.test(token))
    throw new PreviewGameLinkError("lab_private_config_required");
  const now=input.now??Date.now;
  const codeRef=(d:string)=>db.collection(collectionPrefix+"Codes").doc(d);
  const nonceRef=(d:string)=>db.collection(collectionPrefix+"Nonces").doc(d);
  const playerRef=(d:string)=>db.collection(collectionPrefix+"Players").doc(d);
  const receiptRef=(d:string)=>db.collection(collectionPrefix+"Receipts").doc(d);
  const hmac=(label:string,value:string)=>crypto.createHmac("sha256",token)
    .update("netcraft-preview-pair/"+label+"/"+value).digest("hex");
  const validToken=(received:unknown)=>{
    if(typeof received!=="string" || !/^[A-Za-z0-9_-]{43,128}$/.test(received))return false;
    const a=Buffer.from(digest(received),"hex"),b=Buffer.from(digest(token),"hex");
    return crypto.timingSafeEqual(a,b);
  };
  async function issue(gamertag:string){
    if(!goodName(gamertag))
      throw new PreviewGameLinkError("invalid_gamertag");
    const time=now(),code=codeFactory(),
      codeKey=hmac("code",code),
      nameKey=hmac("name",gamertag.toLowerCase()),
      receiptId=digest("netcraft-preview-link/"+crypto.randomUUID());
    await db.runTransaction(async tx=>{
      const player=playerRef(nameKey),snap=await tx.get(player);
      const old=snap.data();
      if(old?.activeUntil>time)
        throw new PreviewGameLinkError("existing_lab_code_active");
      const oldWindow=Number(old?.windowStart);
      const windowStart=Number.isSafeInteger(oldWindow)&&time>=oldWindow&&
        time-oldWindow<WINDOW_MS?oldWindow:time;
      const attempts=windowStart===oldWindow?Number(old?.issuedCount||0):0;
      if(attempts>=MAX_CODES)
        throw new PreviewGameLinkError("lab_code_rate_limited");
      const next={gamertag,activeUntil:time+TTL_MS,
        issuedCount:attempts+1,windowStart,receiptId};
      if(snap.exists)tx.set(player,next);else tx.create(player,next);
      tx.create(codeRef(codeKey),{receiptId,gamertag,
        state:"issued",createdAt:time,expiresAt:time+TTL_MS});
      tx.create(receiptRef(receiptId),{gamertag,state:"issued",
        createdAt:time,expiresAt:time+TTL_MS});
    });
    // The plaintext code is returned ONLY to the authenticated admin issuer.
    return {code,receiptId,expiresAt:time+TTL_MS,simulation:true as const,
      grantsEnabled:false as const};
  }
  async function status(receiptId:string){
    if(!ID.test(receiptId||""))
      throw new PreviewGameLinkError("invalid_lab_receipt");
    const snap=await receiptRef(receiptId).get();
    if(!snap.exists)throw new PreviewGameLinkError("lab_receipt_not_found");
    const data=snap.data();
    return {receiptId,simulation:true as const,grantsEnabled:false as const,
      gamertag:data?.gamertag,
      state:data?.state==="issued"&&Number(data?.expiresAt)<=now()
        ?"expired":data?.state,
      verifiedAt:data?.verifiedAt??null};
  }
  async function challenge(body:unknown,receivedToken:unknown){
    if(!validToken(receivedToken))
      throw new PreviewGameLinkError("unauthorized_bds");
    if(!body || typeof body!=="object"||Array.isArray(body) ||
       Object.keys(body).length!==1||(body as any).schema!==1)
      throw new PreviewGameLinkError("invalid_challenge");
    const time=now();
    if(!Number.isSafeInteger(time)||time<=0)
      throw new PreviewGameLinkError("clock_unavailable");
    const nonce=crypto.randomBytes(16).toString("hex");
    await nonceRef(hmac("nonce",nonce)).create({
      state:"issued",issuedAt:time,expiresAt:time+CHALLENGE_MS,
    });
    return {schema:1 as const,nonce,timestamp:String(time),
      simulation:false as const,dispatchEnabled:false as const};
  }
  async function link(body:unknown,auth:{
    token:unknown;nonce:unknown;timestamp:unknown;
  }){
    if(!validToken(auth?.token))throw new PreviewGameLinkError("unauthorized_bds");
    const time=now();
    if(!NONCE.test(String(auth?.nonce||""))||
       !TIMESTAMP.test(String(auth?.timestamp||""))||
       Math.abs(time-Number(auth.timestamp))>CHALLENGE_MS)
      throw new PreviewGameLinkError("unauthorized_or_stale_challenge");
    const nonceDoc=nonceRef(hmac("nonce",String(auth.nonce)));
    // Consume the nonce first. Any subsequent malformed code or principal
    // must obtain a NEW signed BDS challenge; no replay on failed attempts.
    await db.runTransaction(async tx=>{
      const snap=await tx.get(nonceDoc),proof=snap.data();
      if(!snap.exists||proof?.state!=="issued" ||
         proof?.issuedAt!==Number(auth.timestamp) ||
         time<proof.issuedAt||time>=proof.expiresAt)
        throw new PreviewGameLinkError("challenge_expired_or_replayed");
      tx.update(nonceDoc,{state:"consumed",consumedAt:time});
    });
    if(!body||typeof body!=="object"||Array.isArray(body) ||
       Object.keys(body).length!==3||
       !CODE.test((body as any).code||"")||
       !goodName((body as any).gamertag)||
       !SESSION.test((body as any).sessionId||""))
      throw new PreviewGameLinkError("invalid_game_link_body");
    const claim=body as {code:string;gamertag:string;sessionId:string};
    const c=codeRef(hmac("code",claim.code));
    const sessionDigest=hmac("session",claim.sessionId);
    return db.runTransaction(async tx=>{
      const codeSnap=await tx.get(c),data=codeSnap.data();
      if(!codeSnap.exists||data?.state!=="issued"||
         data?.gamertag!==claim.gamertag||
         !ID.test(data?.receiptId||"")||
         !Number.isSafeInteger(data?.expiresAt)||
         time<data?.createdAt||time>=data.expiresAt)
        throw new PreviewGameLinkError("invalid_or_expired_lab_code");
      const receipt=receiptRef(data.receiptId);
      const r=await tx.get(receipt);
      if(!r.exists||r.data()?.state!=="issued" ||
         r.data()?.gamertag!==claim.gamertag)
        throw new PreviewGameLinkError("lab_receipt_mismatch");
      tx.update(c,{state:"consumed",consumedAt:time});
      tx.update(receipt,{state:"verified_in_game",verifiedAt:time,
        sessionDigest});
      // Fake order ID meets Core's 64-hex schema but is NEVER a commercial
      // order ID, and no commercial service can read these lab collections.
      const orderId=digest("netcraft-preview-lab-order/"+data.receiptId);
      return {status:"verified_in_game" as const,
        gamertag:claim.gamertag,orderId,
        simulation:true as const,grantsEnabled:false as const};
    });
  }
  return Object.freeze({issue,status,challenge,link});
}
