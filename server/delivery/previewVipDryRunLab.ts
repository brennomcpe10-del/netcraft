/**
 * Preview-only, admin-authenticated VIP delivery DRY RUN.
 *
 * This is deliberately not a delivery queue, grant executor, payment receipt,
 * paid checkout, lease, BDS poll or ACK. It only persists the expected outcome
 * in an isolated previewDeliveryVipDryRunV1 collection, never applying ranks.
 *
 * Every first simulation requires a verified in-game pairing receipt with a
 * still-active 15-minute session proof. The client can choose a tier, not the
 * recipient, duration, product ID, rank or simulation timestamps.
 */
import crypto from "node:crypto";
import type {Firestore} from "firebase-admin/firestore";
import {NETCRAFT_VIP_TERMS} from "./netcraftVipCatalogApproval.ts";
import {NETCRAFT_PREVIEW_VIP_APPROVALS}
  from "./netcraftVipPreviewApproval.ts";
import type {VipTier} from "./verifiedRewardRegistry.ts";

type DB=Pick<Firestore,"collection"|"runTransaction">;
type RequestedTier=VipTier;
const RECEIPT=/^[a-f0-9]{64}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const GAMERTAG=/^[A-Za-z0-9_ ]{3,32}$/;
const THIRTY_DAYS_MS=30*24*60*60*1000;
const FIFTEEN_MINUTES_MS=15*60*1000;
const TIERS=new Set<RequestedTier>(["explorer","elite","supreme"]);
const approvedProductByTier=new Map(NETCRAFT_PREVIEW_VIP_APPROVALS
  .map(v=>[v.tier,v.productId] as const));
const fakeOrderId=(receiptId:string)=>crypto.createHash("sha256")
  .update("netcraft-preview-vip-dry-run-order-v1:"+receiptId).digest("hex");

export class PreviewVipDryRunBlocked extends Error {
  constructor(readonly reason:string){super(reason);}
}
export function createPreviewVipDryRunLab(db:DB,opts:{now?:()=>number}={}){
  if(!db?.collection||!db?.runTransaction)
    throw new PreviewVipDryRunBlocked("preview_simulation_storage_required");
  const now=opts.now??Date.now;
  const receipts=db.collection("previewDeliveryLinkLabV1Receipts");
  const simulations=db.collection("previewDeliveryVipDryRunV1");
  const termsFor=(tier:RequestedTier)=>{
    const terms=NETCRAFT_VIP_TERMS[tier],productId=approvedProductByTier.get(tier);
    if(!terms||!productId||terms.days!==30||terms.duration!=="30 dias"||
       !/^ncbr:vip_(explorer|elite|supreme)$/.test(terms.rankTag))
      throw new PreviewVipDryRunBlocked("approved_vip_terms_unavailable");
    return {terms,productId};
  };
  const result=(doc:any,alreadySimulated:boolean)=>Object.freeze({
    schema:1 as const,status:alreadySimulated?"already_simulated" as const:
      "simulated_only" as const,
    receiptId:doc.receiptId,simulatedOrderId:doc.simulatedOrderId,
    gamertag:doc.gamertag,tier:doc.tier,
    productId:doc.productId,rankTag:doc.rankTag,
    days:30 as const,startsAt:doc.startsAt,endsAt:doc.endsAt,
    simulation:true as const,dispatchEnabled:false as const,
    grantsEnabled:false as const,paymentsEnabled:false as const,
    liveVipGranted:false as const,
  });
  function validReceipt(id:unknown):id is string {
    return typeof id==="string"&&RECEIPT.test(id);
  }
  async function simulate(input:{receiptId:string;tier:RequestedTier}){
    if(!input||!validReceipt(input.receiptId)||
       typeof input.tier!=="string"||
       !TIERS.has(input.tier))
      throw new PreviewVipDryRunBlocked("invalid_simulation_request");
    const time=now();
    if(!Number.isSafeInteger(time)||time<=0||
       !Number.isSafeInteger(time+THIRTY_DAYS_MS))
      throw new PreviewVipDryRunBlocked("simulation_clock_unavailable");
    const {terms,productId}=termsFor(input.tier);
    const receiptRef=receipts.doc(input.receiptId);
    const simulatedRef=simulations.doc(input.receiptId);
    return db.runTransaction(async tx=>{
      const [rs,ss]=await Promise.all([tx.get(receiptRef),tx.get(simulatedRef)]);
      const receipt=rs.data(),prior=ss.data();
      // Refuse stale proof, unlinked/untrusted players and old receipts that
      // did not yet store a 15-min expiry. Never accept a browser nickname.
      if(!rs.exists||receipt?.state!=="verified_in_game"||
         !GAMERTAG.test(receipt.gamertag||"")||
         receipt.gamertag!==receipt.gamertag.trim()||
         !DIGEST.test(receipt.sessionDigest||"")||
         !Number.isSafeInteger(receipt.verifiedAt)||
         !Number.isSafeInteger(receipt.proofExpiresAt)||
         receipt.proofExpiresAt!==receipt.verifiedAt+FIFTEEN_MINUTES_MS||
         time<receipt.verifiedAt||time>=receipt.proofExpiresAt)
        throw new PreviewVipDryRunBlocked("game_session_proof_missing_or_expired");
      if(ss.exists){
        if(prior?.receiptId!==input.receiptId||
           prior?.tier!==input.tier||
           prior?.gamertag!==receipt.gamertag||
           prior?.simulation!==true||
           prior?.dispatchEnabled!==false||
           prior?.grantsEnabled!==false)
          throw new PreviewVipDryRunBlocked("simulation_already_exists");
        return result(prior,true);
      }
      // No real orderId, checkout state, payment state, provider check or
      // player-supplied rank is consulted. This record is a mock of a verified
      // order's expected entitlement, NOT any actual entitlement.
      const doc={
        receiptId:input.receiptId,
        simulatedOrderId:fakeOrderId(input.receiptId),
        gamertag:receipt.gamertag,
        tier:input.tier,
        productId,rankTag:terms.rankTag,days:terms.days,
        startsAt:time,endsAt:time+THIRTY_DAYS_MS,
        simulation:true as const,dispatchEnabled:false as const,
        grantsEnabled:false as const,paymentsEnabled:false as const,
        liveVipGranted:false as const,
      };
      tx.create(simulatedRef,doc);
      return result(doc,false);
    });
  }
  async function inspect(receiptId:string){
    if(!validReceipt(receiptId))
      throw new PreviewVipDryRunBlocked("invalid_simulation_request");
    const snap=await simulations.doc(receiptId).get();
    if(!snap.exists)return {status:"not_simulated" as const,
      simulation:true as const,grantsEnabled:false as const};
    const doc=snap.data();
    if(doc?.receiptId!==receiptId||doc.simulation!==true||
       doc.dispatchEnabled!==false||doc.grantsEnabled!==false)
      throw new PreviewVipDryRunBlocked("simulation_record_invalid");
    return result(doc,true);
  }
  return Object.freeze({simulate,inspect});
}
