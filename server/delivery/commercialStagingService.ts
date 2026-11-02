// Durable Pix -> Delivery commercial CANDIDATE. There is intentionally NO
// production route, scheduled worker, or Minecraft dispatcher for this module.
// The emulator-only gate is non-configurable: a feature flag cannot start sales.
// Future production activation requires a separate security/release review.
import crypto from "node:crypto";
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

type Line = {
  productType: "product" | "vip";
  productId: string;
  quantity: number;
  reward?: {version: 1; items: Array<{itemId: string;quantity: number}>};
  duration?: string;
};
type StoredOrder = {
  id: string; environment: "commercial"; catalogValidated: true;
  providerOrderId: string; collector: string; totalCents: number; currency: "BRL";
  gamertag: string; lines: Line[]; state: string;
};
type Payload = {
  contract: "netcraft.delivery.v1"; id: string; orderId: string; gamertag: string;
} & ({kind: "items"; items: Array<{itemId: string;quantity: number}>} |
  {kind: "vip";rankTag: "ncbr:vip_explorer";days: 30});

const fingerprint = (value: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function labOnly() {
  if (process.env.NODE_ENV !== "test" ||
      process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8085" ||
      process.env.VERCEL_ENV || process.env.MERCADOPAGO_ACCESS_TOKEN ||
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
function compileLine(order: StoredOrder, index: number): Payload {
  const l = order.lines[index], id = order.id + "-" + index;
  if (!l || !/^[a-zA-Z0-9_-]{1,80}$/.test(l.productId || "") ||
      !Number.isSafeInteger(l.quantity) || l.quantity < 1 || l.quantity > 64)
    throw new PixError("invalid_delivery_line", 409);
  const base = {
    contract: "netcraft.delivery.v1" as const, id,
    orderId: order.id, gamertag: order.gamertag,
  };
  if (l.productType === "vip") {
    // Only explicitly authorized Core mapping; never map arbitrary VIP names.
    if (l.productId !== "pix-vip" || l.duration !== "30 dias" || l.quantity !== 1)
      throw new PixError("vip_mapping_not_homologated", 409);
    return {...base,kind: "vip",rankTag: "ncbr:vip_explorer",days: 30};
  }
  if (l.productType !== "product" || l.reward?.version !== 1 ||
      !Array.isArray(l.reward.items) || l.reward.items.length < 1 ||
      l.reward.items.length > 36)
    throw new PixError("reward_not_homologated", 409);
  const items = new Map<string, number>();
  let units = 0;
  for (const item of l.reward.items) {
    if (!item || !/^minecraft:[a-z0-9_]+$/.test(item.itemId || "") ||
        !Number.isSafeInteger(item.quantity) || item.quantity < 1)
      throw new PixError("invalid_delivery_item", 409);
    const quantity = item.quantity * l.quantity;
    units += quantity;
    items.set(item.itemId, (items.get(item.itemId) || 0) + quantity);
    if (units > 2304 || (items.get(item.itemId) || 0) > 2304)
      throw new PixError("delivery_capacity_exceeded", 409);
  }
  return {...base,kind: "items",items: [...items.entries()].sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([itemId,quantity])=>({itemId,quantity}))};
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
  options: {keyring: Readonly<Record<string,string>>; now?:()=>number},
) {
  labOnly();
  const clock = options.now || Date.now;
  const orders = db.collection("pixCommercialOrders");
  const queue = db.collection("pixCommercialDeliveries");

  async function providerState(order: StoredOrder) {
    const result = await inspectCommercialOrder(order, reader);
    return result.state;
  }

  async function reconcileAndQueue(orderId: string) {
    labOnly();
    if (!ID.test(orderId)) throw new PixError("invalid_order_id", 400);
    const order = canonicalOrder((await orders.doc(orderId).get()).data());
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
      const current = canonicalOrder(fresh.data());
      const currentMaterial = fingerprint({
        id: current.id,providerOrderId: current.providerOrderId,
        collector: current.collector,totalCents: current.totalCents,currency: current.currency,
        gamertag: current.gamertag,lines: current.lines,
      });
      if (currentMaterial !== material)
        throw new PixError("order_changed_during_provider_check", 409);
      const refs = order.lines.map((_,i)=>queue.doc(orderId + "-" + i));
      const snapshots = await Promise.all(refs.map(ref=>tx.get(ref)));
      const resolved = current.state === "refunded" ? "refunded" :
        current.state === "review_required" ? "review_required" :
        state === "approved" && snapshots.some(s=>s.exists &&
          ["blocked","review_required","refunded_after_ack"].includes(s.data()?.state))
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
          }
        }
      } else {
        for (let i=0;i<snapshots.length;i++) {
          if (!snapshots[i].exists) continue;
          const prior = snapshots[i].data();
          if (prior?.state === "acknowledged")
            tx.update(refs[i],{state:"refunded_after_ack",reason:"manual_refund_review"});
          else if (!["blocked","refunded_after_ack"].includes(prior?.state))
            tx.update(refs[i],{state:"blocked",reason:"payment_not_confirmed"});
        }
      }
      tx.update(orderRef,{
        state:resolved,updatedAt:new Date(clock()).toISOString(),
        dispatchEnabled:false,paymentReviewRequired:resolved==="review_required" ||
          resolved==="refunded" || (state!=="approved" && snapshots.some(s=>s.exists)),
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
    const order = canonicalOrder(orderSnap);
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
        return {status:"review_required" as const};
      }
      tx.update(queue.doc(deliveryId),{
        state:"leased",leaseToken,attempts:job.attempts+1,
        leasedAt:new Date(clock()).toISOString(),
      });
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
    if (job.state !== "leased") return {status:"held" as const};
    const order = canonicalOrder((await orders.doc(job.orderId).get()).data());
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
      if (current.state !== "leased") return {status:"held" as const};
      if (!approved || o?.state !== "approved" ||
          o?.providerOrderId !== order.providerOrderId ||
          o?.totalCents !== order.totalCents ||
          o?.collector !== order.collector ||
          o?.gamertag !== order.gamertag ||
          JSON.stringify(o?.lines) !== JSON.stringify(order.lines)) {
        tx.update(queue.doc(deliveryId),{state:"review_required",reason:"payment_changed_after_offer"});
        return {status:"review_required" as const};
      }
      tx.update(queue.doc(deliveryId),{
        state:"acknowledged",ackResult:result,
        acknowledgedAt:new Date(clock()).toISOString(),
      });
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
      if (!job || job.state !== "leased" || job.leaseToken !== leaseToken)
        return {status:"held" as const};
      // Only the BDS engine's pre-receipt result is demonstrably safe to retry.
      // Any ambiguous or started grant requires manual recovery, never a
      // blind re-delivery that could double items or extend VIP twice.
      if (receipt !== "none" || !SAFE_NACK.has(reason)) {
        tx.update(ref,{state:"review_required",reason:"ambiguous_delivery"});
        return {status:"review_required" as const};
      }
      const order=await tx.get(orders.doc(job.orderId));
      if (order.data()?.state !== "approved") {
        tx.update(ref,{state:"blocked",reason:"payment_revoked"});
        return {status:"held" as const};
      }
      tx.update(ref,{
        state:"queued",leaseToken:null,
        retryAfter:clock()+RETRY_MS,lastNackReason:reason,
      });
      return {status:"retryable" as const,retryAfter:clock()+RETRY_MS};
    });
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

  return {reconcileAndQueue,offer,acknowledge,nack,authenticatedRequest};
}
