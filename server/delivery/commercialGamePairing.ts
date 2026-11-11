/**
 * Commercial buyer checkout-key -> authenticated BDS in-game proof.
 * LAB CANDIDATE: no HTTP route or Bedrock entrypoint invokes this by default.
 *
 * A browser nickname is never proof of game ownership. The shop returns a
 * high-entropy, short-lived, one-use voucher only for a server-created order.
 * The player must enter it IN THE GAME; only an authenticated private BDS
 * handler may call claimInGame, with a principal built from player.name/id.
 *
 * Player.id is an in-game SESSION/ENTITY reference, NOT a stable Xbox XUID.
 * It must be checked again against the currently online player by Core; a
 * successful claim alone is NOT permission to grant a reward.
 */
import crypto from "node:crypto";
import type {Firestore} from "firebase-admin/firestore";

type DB=Pick<Firestore,"collection"|"runTransaction">;
const ORDER=/^[a-f0-9]{64}$/;
const KEY=/^[A-Za-z0-9-]{20,80}$/;
const NAME=/^[A-Za-z0-9_ ]{3,32}$/;
const SESSION=/^[A-Za-z0-9_:\-.]{1,128}$/;
const CODE=/^NC-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const TTL_MS=10*60*1000;
const PROOF_MS=15*60*1000;
const DAY=24*60*60*1000;
const MAX_ISSUES_PER_DAY=5;
const ALPHABET="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const secureCode=()=>{
  const bytes=crypto.randomBytes(16);
  // 80-bit unpredictable code, uniform over 32 symbols.
  let characters="";
  for(let i=0;i<16;i++)characters+=ALPHABET[bytes[i]&31];
  return "NC-"+characters.match(/.{4}/g)!.join("-");
};
const orderIdFor=(key:string)=>crypto.createHash("sha256")
  .update("netcraft-commercial-v1:"+key).digest("hex");
const validPrincipal=(name:string,sessionId:string)=>
  NAME.test(name)&&name.trim()===name&&SESSION.test(sessionId);

export class CommercialGamePairingBlocked extends Error{
  constructor(readonly reason:string){super(reason);}
}

export function createCommercialGamePairing(db:DB,opts:{
  hashSecret:string;
  now?:()=>number;
}){
  if(!db?.collection||!db?.runTransaction||
     typeof opts.hashSecret!=="string"||
     Buffer.byteLength(opts.hashSecret,"utf8")<32)
    throw new CommercialGamePairingBlocked("pairing_configuration_missing");
  const now=opts.now??Date.now;
  const orders=db.collection("pixCommercialOrders");
  const slots=db.collection("pixCommercialPlayerLinkSlots");
  const codes=db.collection("pixCommercialPlayerLinkCodes");
  const digest=(namespace:string,plain:string)=>crypto.createHmac("sha256",opts.hashSecret)
    .update("netcraft-delivery/"+namespace+"/v1:"+plain).digest("hex");

  /** Buyer-only after persisted checkout; never based on a public nickname. */
  async function issueForCheckoutKey(checkoutKey:string){
    if(!KEY.test(checkoutKey||""))
      throw new CommercialGamePairingBlocked("checkout_key_required");
    const orderId=orderIdFor(checkoutKey),time=now(),code=secureCode();
    if(!Number.isSafeInteger(time)||time<=0)
      throw new CommercialGamePairingBlocked("clock_unavailable");
    const codeDigest=digest("code",code);
    const orderRef=orders.doc(orderId),slotRef=slots.doc(orderId),
      codeRef=codes.doc(codeDigest);
    await db.runTransaction(async tx=>{
      const [o,s]=await Promise.all([tx.get(orderRef),tx.get(slotRef)]);
      const order=o.data(),slot=s.data();
      if(!o.exists||!order||order.id!==orderId||
         order.environment!=="commercial"||
         order.checkoutOrigin!=="netcraft_commercial_checkout_v1"||
         order.catalogValidated!==true||
         typeof order.requestHash!=="string"||
         !/^[a-f0-9]{64}$/.test(order.requestHash)||
         !NAME.test(order.gamertag||"")||
         order.gamertag.trim()!==order.gamertag||
         ["cancelled","expired","refunded","disputed"].includes(order.state))
        throw new CommercialGamePairingBlocked("order_not_eligible");
      if(slot?.state==="verified_in_game"&&
         Number(slot.proofExpiresAt)>time)
        throw new CommercialGamePairingBlocked("already_linked");
      if(Number(slot?.codeExpiresAt)>time)
        throw new CommercialGamePairingBlocked("code_still_active");
      const previousWindow=Number(slot?.windowStart);
      const windowStart=Number.isSafeInteger(previousWindow)&&
        time>=previousWindow&&time-previousWindow<DAY?previousWindow:time;
      const attempts=slot&&windowStart===previousWindow?
        Number(slot.issuedCount||0):0;
      if(attempts>=MAX_ISSUES_PER_DAY)
        throw new CommercialGamePairingBlocked("pairing_rate_limit");
      const next={orderId,gamertag:order.gamertag,
        state:"awaiting_game",codeDigest,
        codeExpiresAt:time+TTL_MS,
        proofExpiresAt:0,gameSessionDigest:null,
        issuedCount:attempts+1,windowStart,updatedAt:time};
      tx.create(codeRef,{orderId,gamertag:order.gamertag,
        createdAt:time,expiresAt:time+TTL_MS,status:"issued"});
      if(s.exists)tx.set(slotRef,next);else tx.create(slotRef,next);
    });
    // This is the only place where plaintext code leaves the backend.
    // Never store the code in Firestore, application logs or browser telemetry.
    return Object.freeze({code,expiresAt:time+TTL_MS,orderId});
  }

  /** This method MUST be called after authenticated BDS TLS+nonce validation. */
  async function claimInGame(input:{
    code:string;gamertag:string;sessionId:string;
  },authenticatedGamePrincipal:()=>boolean){
    if(!CODE.test(input?.code||"")||
       !validPrincipal(input?.gamertag||"",input?.sessionId||"")||
       typeof authenticatedGamePrincipal!=="function"||
       authenticatedGamePrincipal()!==true)
      throw new CommercialGamePairingBlocked("unverified_game_principal");
    const time=now(),codeDigest=digest("code",input.code),
      codeRef=codes.doc(codeDigest);
    const sessionDigest=digest("session",input.sessionId);
    return db.runTransaction(async tx=>{
      const c=await tx.get(codeRef),voucher=c.data();
      if(!c.exists||voucher?.status!=="issued"||
         !ORDER.test(voucher.orderId||"")||
         !Number.isSafeInteger(voucher.expiresAt)||
         time>=voucher.expiresAt||time<voucher.createdAt||
         voucher.gamertag!==input.gamertag)
        throw new CommercialGamePairingBlocked("invalid_or_expired_code");
      const orderRef=orders.doc(voucher.orderId),slotRef=slots.doc(voucher.orderId);
      const [o,s]=await Promise.all([tx.get(orderRef),tx.get(slotRef)]);
      const order=o.data(),slot=s.data();
      if(!o.exists||!s.exists||
         order?.environment!=="commercial"||
         order?.id!==voucher.orderId||
         order?.gamertag!==input.gamertag||
         !["pending","processing","approved","creating"].includes(order.state)||
         slot?.state!=="awaiting_game"||
         slot?.codeDigest!==codeDigest||
         slot?.codeExpiresAt!==voucher.expiresAt)
        throw new CommercialGamePairingBlocked("pairing_state_mismatch");
      tx.update(codeRef,{status:"consumed",consumedAt:time});
      tx.update(slotRef,{state:"verified_in_game",
        codeDigest:null,codeExpiresAt:0,
        gameSessionDigest:sessionDigest,
        proofExpiresAt:time+PROOF_MS,verifiedAt:time});
      return {status:"verified_in_game" as const,gamertag:input.gamertag,
        // Order ID is returned only through authenticated private BDS TLS.
        // Required for Core to bind the verified session to this exact order.
        orderId:voucher.orderId};
    });
  }

  /** Never call with a browser-supplied session ID; Core must attest it. */
  async function verifyActiveSession(input:{
    orderId:string;gamertag:string;sessionId:string;
  }){
    if(!ORDER.test(input.orderId||"")||
       !validPrincipal(input.gamertag||"",input.sessionId||""))
      return false;
    const slot=(await slots.doc(input.orderId).get()).data();
    if(slot?.state!=="verified_in_game"||
       slot.orderId!==input.orderId||
       slot.gamertag!==input.gamertag||
       !Number.isSafeInteger(slot.proofExpiresAt)||
       now()>=slot.proofExpiresAt||
       typeof slot.gameSessionDigest!=="string"||
       !/^[a-f0-9]{64}$/.test(slot.gameSessionDigest))
      return false;
    const expected=Buffer.from(slot.gameSessionDigest,"hex");
    const submitted=Buffer.from(digest("session",input.sessionId),"hex");
    return crypto.timingSafeEqual(expected,submitted);
  }
  return Object.freeze({issueForCheckoutKey,claimInGame,verifyActiveSession});
}
