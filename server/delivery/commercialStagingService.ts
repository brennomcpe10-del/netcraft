// Durable Pix -> Delivery commercial CANDIDATE. There is intentionally NO
// production route, scheduled worker, or Minecraft dispatcher for this module.
// The emulator-only gate is non-configurable: a feature flag cannot start sales.
// Future production activation requires a separate security/release review.
import crypto from "node:crypto";
import {mappedDelivery, type RewardRegistry} from "./verifiedRewardRegistry.ts";
import {makeAuditRecord, publicDeliveryDiagnostic, type DeliveryEvent,
  type DeliveryReason} from "./deliveryAudit.ts";
import type {Firestore} from "firebase-admin/firestore";
import {PixError} from "../payments/mercadoPago.ts";
import {
  inspectCommercialOrder,
  type CommercialGatewayReader,
} from "../payments/commercialInspection.ts";
import {
  authenticateBdsRequest, type BdsSignedMessage,
} from "./bdsSignedRequest.ts";

type DB = Pick<Firestore, "collection" | "runTransaction">;
const ID = /^[a-f0-9]{64}$/;
const DELIVERY_ID = /^[a-f0-9]{64}-(0|[1-9][0-9]{0,2})$/;
const GAMERTAG = /^[A-Za-z0-9_ ]{3,32}$/;
const SAFE_NACK = new Set([
  "player_offline", "inventory_full", "inventory_unavailable",
  "vip_not_configured", "vip_not_loaded",
]);
const MAX_OFFERS = 20;
const RETRY_MS = 5000;
// A timed-out lease might already have granted rewards in Minecraft.
// Never automatically release it or issue another lease on restart.
const LOST_CONNECTION_MS = 120_000;

type Line = {
  productType: "product" | "vip";
  productId: string;
  quantity: number;
  reward?: {version: 1; items: Array<{itemId: string;quantity: number}>};
  duration?: string;
};
export type StoredOrder = {
  id: string; environment: "commercial"; catalogValidated: true;
  providerOrderId: string; collector: string; totalCents: number; currency: "BRL";
  gamertag: string; lines: Line[]; state: string;
};

const fingerprint = (value: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function labOnly() {
  if (process.env.NODE_ENV !== "test" ||
      process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8085" ||
      process.env.VERCEL_ENV || process.env.MERCADOPAGO_ACCESS_TOKEN ||
      process.env.MP_ACCESS_TOKEN || process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    throw new PixError("commercial_delivery_release_blocked", 503);
}
function canonicalOrder(o: any): StoredOrder {
  if (!o || !ID.test(o.id || "") || o.environment !== "commercial" ||
      o.catalogValidated !== true ||
      !/^ORD[A-Z0-9]{20,40}$/.test(o.providerOrderId || "") ||
      !/^[0-9]{1,24}$/.test(o.collector || "") ||
      o.currency !== "BRL" || !Number.isSafeInteger(o.totalCents) ||
      o.totalCents < 1 || o.totalCents > 1000000 ||
      !GAMERTAG.test(o.gamertag || "") || o.gamertag.trim() !== o.gamertag ||
      !Array.isArray(o.lines) || o.lines.length < 1 || o.lines.length > 20)
    throw new PixError("invalid_commercial_order_snapshot", 409);
  return o as StoredOrder;
}

const safeBody = (body: string) => {
  let parsed: any;
  try { parsed = JSON.parse(body); } catch { throw new PixError("invalid_delivery_json", 400); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new PixError("invalid_delivery_body", 400);
  return parsed;
};
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length &&
  Object.keys(value).every(key => keys.includes(key));

export function createCommercialStagingService(
  db: DB,
  reader: CommercialGatewayReader,
  options: {keyring: Readonly<Record<string,string>>;
    registry: RewardRegistry; now?:()=>number;
    // Optional LAB-only catalog approval: checked on EVERY read of an order
    // during reconcile, offer and ACK. No public dispatch path uses this.
    validateOrder?:(order:Readonly<StoredOrder>)=>void},
) {
  labOnly();
  const clock = options.now || Date.now;
  const validatedOrder = (raw:unknown):StoredOrder => {
    const order=canonicalOrder(raw);
    options.validateOrder?.(order);
    return order;
  };
  const orders = db.collection("pixCommercialOrders");
  const queue = db.collection("pixCommercialDeliveries");
  if(!options.registry || Object.keys(options.registry).length===0)
    throw new PixError("approved_reward_registry_required",503);
  const compileLine = (order:StoredOrder,index:number) =>
    mappedDelivery({orderId:order.id,index,gamertag:order.gamertag,
      line:order.lines[index],registry:options.registry});
  const auditRecords = db.collection("pixCommercialDeliveryAudit");
  function journal(tx:any,event:DeliveryEvent,orderId:string,deliveryId?:string,
    reason:DeliveryReason="none") {
    const entry=makeAuditRecord({event,reason,orderId,deliveryId,now:clock()});
    tx.create(auditRecords.doc(entry.id),entry.record);
  }

  async function providerState(order: StoredOrder) {
    const result = await inspectCommercialOrder(order, reader);
    return result.state;
  }

  async function reconcileAndQueue(orderId: string) {
    labOnly();
    if (!ID.test(orderId)) throw new PixError("invalid_order_id", 400);
    const order = validatedOrder((await orders.doc(orderId).get()).data());
    const state = await providerState(order);
    const material = fingerprint({
      id: order.id,providerOrderId: order.providerOrderId,
      collector: order.collector,totalCents: order.totalCents,currency: order.currency,
      gamertag: order.gamertag,lines: order.lines,
    });
    // Never create a partially deliverable order. Every line must compile
    // before writing any jobs, even if the caller retries after a crash.
    const payloads = state === "approved" ? order.lines.map((_,i)=>compileLine(order,i)) : [];
    return db.runTransaction(async tx => {
      const orderRef = orders.doc(orderId), fresh = await tx.get(orderRef);
      const current = validatedOrder(fresh.data());
      const currentMaterial = fingerprint({
        id: current.id,providerOrderId: current.providerOrderId,
        collector: current.collector,totalCents: current.totalCents,currency: current.currency,
        gamertag: current.gamertag,lines: current.lines,
      });
      if (currentMaterial !== material)
        throw new PixError("order_changed_during_provider_check", 409);
      const refs = order.lines.map((_,i)=>queue.doc(orderId + "-" + i));
      const snapshots = await Promise.all(refs.map(ref=>tx.get(ref)));
      const resolved = current.state === "refunded" || state === "refunded"
        ? "refunded" :
        state === "disputed" ? "disputed" :
        (current.state === "review_required" ||
          current.state === "disputed" && state === "approved" ||
          state === "approved" && snapshots.some(s=>s.exists &&
           ["blocked","review_required","refunded_after_ack"].includes(s.data()?.state)))
        ? "review_required" : state;
      if (resolved === "approved") {
        for (let i=0;i<payloads.length;i++) {
          const payload = payloads[i], digest = fingerprint(payload);
          const existing = snapshots[i];
          if (existing.exists) {
            if (existing.data()?.fingerprint !== digest ||
                existing.data()?.orderId !== orderId)
              throw new PixError("delivery_id_conflict", 409);
          } else {
            tx.create(refs[i],{
              id: payload.id,orderId, gamertag: order.gamertag,
              lineIndex:i,environment:"commercial_candidate",
              fingerprint:digest,payload,state:"queued",
              dispatchEnabled:false,attempts:0,createdAt:new Date(clock()).toISOString(),
            });
            journal(tx,"order_queued",orderId,payload.id);
          }
        }
      } else {
        for (let i=0;i<snapshots.length;i++) {
          if (!snapshots[i].exists) continue;
          const prior = snapshots[i].data();
          const holdReason: DeliveryReason = resolved === "refunded"
            ? "refund_or_chargeback" : resolved === "disputed"
              ? "payment_disputed" : resolved === "expired"
                ? "payment_expired" : resolved === "cancelled"
                  ? "payment_cancelled" : "payment_not_confirmed";
          if (prior?.state === "acknowledged") {
            tx.update(refs[i],{state:"refunded_after_ack",reason:"manual_refund_review"});
            journal(tx,"refund_review",orderId,refs[i].id,"manual_refund_review");
          } else if (!["blocked","refunded_after_ack"].includes(prior?.state)) {
            tx.update(refs[i],{state:"blocked",reason:holdReason});
            journal(tx,"payment_blocked",orderId,refs[i].id,holdReason);
          }
        }
      }
      tx.update(orderRef,{
        state:resolved,updatedAt:new Date(clock()).toISOString(),
        dispatchEnabled:false,paymentReviewRequired:resolved==="review_required" ||
          resolved==="refunded" || resolved==="disputed" ||
          (state!=="approved" && snapshots.some(s=>s.exists)),
      });
      return {state:resolved,created:resolved==="approved"?
        snapshots.filter(s=>!s.exists).length:0,dispatchEnabled:false as const};
    });
  }

  async function offer(deliveryId: string, gamertag: string, online: boolean) {
    labOnly();
    if (!DELIVERY_ID.test(deliveryId) || !GAMERTAG.test(gamertag) ||
        gamertag.trim() !== gamertag) throw new PixError("invalid_delivery_request",400);
    if (online !== true) return {status:"offline" as const};
    const initial = (await queue.doc(deliveryId).get()).data();
    if (!initial || initial.gamertag !== gamertag ||
        initial.dispatchEnabled !== false || initial.state !== "queued")
      return {status:"held" as const};
    const orderSnap = (await orders.doc(initial.orderId).get()).data();
    const order = validatedOrder(orderSnap);
    if (order.state !== "approved" ||
        await providerState(order) !== "approved")
      return {status:"payment_not_approved" as const};
    const payload = compileLine(order, initial.lineIndex);
    const digest = fingerprint(payload);
    const leaseToken = crypto.randomBytes(16).toString("hex");
    return db.runTransaction(async tx => {
      const [freshOrder, freshJob] = await Promise.all([
        tx.get(orders.doc(order.id)),tx.get(queue.doc(deliveryId)),
      ]);
      const o = freshOrder.data(),job = freshJob.data();
      if (!o || !job || o.state !== "approved" ||
          o.providerOrderId !== order.providerOrderId ||
          o.collector !== order.collector || o.totalCents !== order.totalCents ||
          o.gamertag !== order.gamertag ||
          JSON.stringify(o.lines) !== JSON.stringify(order.lines) ||
          job.state !== "queued" || job.dispatchEnabled !== false ||
          job.orderId !== order.id || job.fingerprint !== digest ||
          (job.retryAfter && job.retryAfter > clock()))
        return {status:"held" as const};
      if (!Number.isSafeInteger(job.attempts) || job.attempts >= MAX_OFFERS) {
        tx.update(queue.doc(deliveryId),{state:"review_required",reason:"max_offers"});
        journal(tx,"lease_manual_review",order.id,deliveryId,"max_offers");
        return {status:"review_required" as const};
      }
      tx.update(queue.doc(deliveryId),{
        state:"leased",leaseToken,attempts:job.attempts+1,
        leasedAt:new Date(clock()).toISOString(),
      });
      journal(tx,"lease_offered",order.id,deliveryId);
      // A lease is a simulated offer, NEVER authority to grant on Production.
      return {status:"offered" as const,payload,leaseToken,dispatchEnabled:false as const};
    });
  }

  async function acknowledge(deliveryId:string, leaseToken:string, result:string) {
    labOnly();
    if (!DELIVERY_ID.test(deliveryId) || !/^[a-f0-9]{32}$/.test(leaseToken) ||
        !["applied","already_applied"].includes(result))
      throw new PixError("invalid_ack",400);
    const job = (await queue.doc(deliveryId).get()).data();
    if (!job || job.leaseToken !== leaseToken)
      return {status:"held" as const};
    if (job.state === "acknowledged")
      return {status:"acknowledged" as const,duplicate:true};
    if (!["leased","awaiting_receipt"].includes(job.state))
      return {status:"held" as const};
    const order = validatedOrder((await orders.doc(job.orderId).get()).data());
    let approved=false;
    try { approved = order.state === "approved" &&
      (await providerState(order)) === "approved"; } catch { approved=false; }
    return db.runTransaction(async tx => {
      const [orderSnap,jobSnap]=await Promise.all([
        tx.get(orders.doc(order.id)),tx.get(queue.doc(deliveryId)),
      ]);
      const current=jobSnap.data(),o=orderSnap.data();
      if (!current || current.leaseToken !== leaseToken)
        return {status:"held" as const};
      if (current.state === "acknowledged")
        return {status:"acknowledged" as const,duplicate:true};
      if (!["leased","awaiting_receipt"].includes(current.state))
        return {status:"held" as const};
      if (!approved || o?.state !== "approved" ||
          o?.providerOrderId !== order.providerOrderId ||
          o?.totalCents !== order.totalCents ||
          o?.collector !== order.collector ||
          o?.gamertag !== order.gamertag ||
          JSON.stringify(o?.lines) !== JSON.stringify(order.lines)) {
        tx.update(queue.doc(deliveryId),{state:"review_required",reason:"payment_changed_after_offer"});
        journal(tx,"lease_manual_review",order.id,deliveryId,"payment_changed_after_offer");
        return {status:"review_required" as const};
      }
      tx.update(queue.doc(deliveryId),{
        state:"acknowledged",ackResult:result,
        acknowledgedAt:new Date(clock()).toISOString(),
      });
      journal(tx,"lease_ack",order.id,deliveryId);
      return {status:"acknowledged" as const,duplicate:false};
    });
  }

  async function nack(deliveryId:string,leaseToken:string,reason:string,receipt:string) {
    labOnly();
    if (!DELIVERY_ID.test(deliveryId) || !/^[a-f0-9]{32}$/.test(leaseToken) ||
        typeof reason !== "string" || !["none","started","applied","unknown"].includes(receipt))
      throw new PixError("invalid_nack",400);
    return db.runTransaction(async tx => {
      const ref=queue.doc(deliveryId),snap=await tx.get(ref),job=snap.data();
      if (!job || !["leased","awaiting_receipt"].includes(job.state) ||
          job.leaseToken !== leaseToken)
        return {status:"held" as const};
      // Only the BDS engine's pre-receipt result is demonstrably safe to retry.
      // Any ambiguous or started grant requires manual recovery, never a
      // blind re-delivery that could double items or extend VIP twice.
      if (receipt !== "none" || !SAFE_NACK.has(reason)) {
        tx.update(ref,{state:"review_required",reason:"ambiguous_delivery"});
        journal(tx,"lease_manual_review",job.orderId,deliveryId,"ambiguous_delivery");
        return {status:"review_required" as const};
      }
      const order=await tx.get(orders.doc(job.orderId));
      if (order.data()?.state !== "approved") {
        tx.update(ref,{state:"blocked",reason:"payment_revoked"});
        journal(tx,"payment_blocked",job.orderId,deliveryId,"payment_revoked");
        return {status:"held" as const};
      }
      tx.update(ref,{
        state:"queued",leaseToken:null,
        retryAfter:clock()+RETRY_MS,lastNackReason:reason,
      });
      journal(tx,"lease_nack_retry",job.orderId,deliveryId,reason as DeliveryReason);
      return {status:"retryable" as const,retryAfter:clock()+RETRY_MS};
    });
  }

  // Supervised recovery scanner; never auto-reissues an expired lease.
  // Preserve the previous token for a late authenticated BDS receipt.
  async function recoverAfterRestart(limit = 40) {
    labOnly();
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new PixError("invalid_recovery_limit",400);
    const found=await queue.where("state","==","leased").get();
    const totals={examined:0,awaitingReceipt:0,skipped:0,
      dispatchEnabled:false as const};
    for (const candidate of found.docs.slice(0,limit)) {
      const initial=candidate.data();
      const time=Date.parse(initial?.leasedAt || "");
      if (!DELIVERY_ID.test(candidate.id) ||
          !Number.isFinite(time) || clock()-time < LOST_CONNECTION_MS) {
        totals.skipped++;continue;
      }
      totals.examined++;
      // Failed provider checks require a receipt; they never trigger retries.
      let providerApproved=false;
      try {
        const o=validatedOrder((await orders.doc(initial.orderId).get()).data());
        providerApproved=o.state==="approved" &&
          (await providerState(o))==="approved";
      } catch { providerApproved=false; }
      const marked=await db.runTransaction(async tx=>{
        const ref=queue.doc(candidate.id),snap=await tx.get(ref);
        const job=snap.data();
        if (!job || job.state!=="leased" ||
            job.leaseToken!==initial.leaseToken ||
            job.leasedAt!==initial.leasedAt)
          return false;
        tx.update(ref,{
          state:"awaiting_receipt",
          reason:providerApproved?"recovery_receipt_required":"provider_check_failed",
          recoveryDetectedAt:new Date(clock()).toISOString(),
        });
        journal(tx,"lease_recovery",job.orderId,candidate.id,
          providerApproved?"stale_lease":"provider_check_failed");
        return true;
      });
      if (marked) totals.awaitingReceipt++;
      else totals.skipped++;
    }
    return totals;
  }

  // Read-only future admin diagnostics: never reveal private payloads,
  // player names, signatures, payment identifiers or lease tokens.
  async function diagnose(deliveryId: string) {
    labOnly();
    if (!DELIVERY_ID.test(deliveryId))
      throw new PixError("invalid_delivery_id",400);
    const snap=await queue.doc(deliveryId).get();
    return {found:snap.exists,...publicDeliveryDiagnostic(snap.data())};
  }

  async function authenticatedRequest(
    message: BdsSignedMessage, secureTransport: boolean,
  ) {
    labOnly();
    // This argument must be supplied by an actual HTTPS/TLS server adapter,
    // NOT by a client header or JSON field. No public adapter is installed.
    if (secureTransport !== true)
      throw new PixError("verified_https_required",403);
    await authenticateBdsRequest(db,message,options.keyring,clock());
    const body=safeBody(message.body);
    if (message.action === "poll") {
      if (!exactKeys(body,["gamertag","online"]) ||
          !GAMERTAG.test(body.gamertag || "") || typeof body.online !== "boolean")
        throw new PixError("invalid_poll",400);
      if (!body.online)return {simulation:true,dispatchEnabled:false,deliveries:[]};
      const found=await queue.where("gamertag","==",body.gamertag).get();
      const deliveries=[];
      for (const snap of found.docs.slice(0,20)) {
        if (deliveries.length>=4)break;
        const result=await offer(snap.id,body.gamertag,true);
        if (result.status==="offered")deliveries.push(result);
      }
      return {simulation:true,dispatchEnabled:false,deliveries};
    }
    if (!exactKeys(body,["deliveryId","leaseToken",
      ...(message.action==="ack"?["result"]:["reason","receipt"])]))
      throw new PixError("invalid_delivery_reply",400);
    if (message.action === "ack")
      return acknowledge(body.deliveryId,body.leaseToken,body.result);
    return nack(body.deliveryId,body.leaseToken,body.reason,body.receipt);
  }

  return {reconcileAndQueue,offer,acknowledge,nack,authenticatedRequest,
    recoverAfterRestart,diagnose};
}
