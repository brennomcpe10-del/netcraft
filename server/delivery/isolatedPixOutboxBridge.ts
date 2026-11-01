// LOCAL EMULATOR-ONLY contract for the Pix Orders test outbox and Core executor.
// It is not wired to the public API, Vercel, Cloudflare or MagnoHost.
// No payment mutation, BDS network connection or actual Minecraft grant is performed.
import crypto from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { verifyOrder, ordersState } from "../payments/ordersContract.ts";
import { previewDeliveryPlan } from "./rewardPlan.ts";
import { draftCoreDelivery } from "./coreJobContract.ts";

type Provider = {
  me(): Promise<{id: string | number; netcraftTestAccount: boolean}>;
  get(id: string): Promise<any>;
};
type RankMapping = { rankTag: string; days: number; duration: string };
type BridgeJob =
  | {contract: "netcraft.delivery.v1"; id: string; orderId: string;
      gamertag: string; kind: "items"; items: {itemId: string; quantity: number}[]}
  | {contract: "netcraft.delivery.v1"; id: string; orderId: string;
      gamertag: string; kind: "vip"; rankTag: string; days: number};

function localOnly() {
  if (process.env.NODE_ENV !== "test" ||
      process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8085" ||
      process.env.VERCEL_ENV || process.env.MERCADOPAGO_ACCESS_TOKEN ||
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.NC_SANDBOX_ENABLED === "true")
    throw new Error("isolated_firestore_emulator_required");
}
const validId = (s: string) => /^[a-f0-9]{64}-\d{1,3}$/.test(s);
const validName = (s: unknown): s is string =>
  typeof s === "string" && /^[A-Za-z0-9_ ]{1,32}$/.test(s) && s.trim() === s;
const digest = (o: unknown) => crypto.createHash("sha256")
  .update(JSON.stringify(o)).digest("hex");
const hold = (reason: string) => ({status:"held" as const, reason});

export function createIsolatedPixOutboxBridge(
  db: Pick<Firestore, "collection" | "runTransaction">,
  provider: Provider,
  options: { vipMappings?: Record<string, RankMapping>; now?: () => number } = {},
) {
  localOnly();
  const clock = options.now ?? Date.now;
  const ranks = Object.freeze({...options.vipMappings});
  const jobs = db.collection("pixTestDeliveries");
  const orders = db.collection("pixTestOrders");
  const leases = db.collection("pixTestBridgeLeasesV03");
  const safeMapping = (productId: string, duration: string): RankMapping | null => {
    const rank = ranks[productId];
    // Only an explicitly configured test product may map to the existing Core tag.
    if (!rank || rank.rankTag !== "ncbr:vip_explorer" ||
        rank.days !== 30 || rank.duration !== duration || duration !== "30 dias")
      return null;
    return rank;
  };
  async function verify(id: string): Promise<
    {ok:true; payload:BridgeJob; order:any; job:any} |
    {ok:false; reason:string}
  > {
    localOnly();
    if (!validId(id)) return {ok:false,reason:"invalid_delivery_id"};
    const orderId = id.split("-")[0], index = Number(id.split("-")[1]);
    const [orderSnap, jobSnap] = await Promise.all([
      orders.doc(orderId).get(), jobs.doc(id).get(),
    ]);
    const order = orderSnap.data(), job = jobSnap.data();
    if (!order || !job || job.orderId !== orderId ||
        job.id !== id || job.lineIndex !== index ||
        order.id !== orderId || order.environment !== "test" ||
        job.environment !== "test" || order.apiVersion !== "orders-v1" ||
        order.state !== "approved" || job.state !== "pending" ||
        job.dispatchEnabled !== false || order.receiverIsTestAccount !== true ||
        typeof order.collector !== "string" || !/^\d+$/.test(order.collector) ||
        !validName(order.gamertag) || job.gamertag !== order.gamertag ||
        !Array.isArray(order.lines) || index >= order.lines.length ||
        JSON.stringify(order.lines[index]) !== JSON.stringify(job.line) ||
        !/^ORD[A-Z0-9]{20,40}$/.test(order.providerOrderId || "") ||
        !/^PAY[A-Z0-9]{20,40}$/.test(order.paymentId || ""))
      return {ok:false,reason:"untrusted_or_unapproved_outbox"};
    const plan = previewDeliveryPlan(job.line);
    if (JSON.stringify(plan) !== JSON.stringify(job.previewPlan))
      return {ok:false,reason:"plan_mismatch"};
    let payload: BridgeJob;
    if (plan.kind === "items") {
      const draft = draftCoreDelivery({
        deliveryId:id, orderId, gamertag:job.gamertag,
        orderState:"approved",environment:"test",plan,
      });
      if (!draft.payload || draft.reason !== "bridge_not_connected" ||
          JSON.stringify(draft) !== JSON.stringify(job.coreDraft))
        return {ok:false,reason:"reward_not_authorized"};
      payload = draft.payload;
    } else if (plan.kind === "vip") {
      if (job.line.quantity !== 1) return {ok:false,reason:"vip_quantity_invalid"};
      const mapping = safeMapping(plan.vipProductId || "",plan.vipDuration || "");
      if (!mapping) return {ok:false,reason:"vip_mapping_required"};
      // The Core starts the test entitlement on grant; approvalObservedAt is
      // not fraudulently presented as an authoritative provider timestamp.
      payload = {contract:"netcraft.delivery.v1",id,orderId,
        gamertag:job.gamertag,kind:"vip",rankTag:mapping.rankTag,days:mapping.days};
    } else return {ok:false,reason:"reward_unconfigured"};
    // Independently re-query the provider: local `approved`, webhook payloads
    // and screenshots never suffice. Test receiver identity is mandatory.
    try {
      const receiver = await provider.me();
      if (receiver.netcraftTestAccount !== true ||
          String(receiver.id) !== order.collector)
        return {ok:false,reason:"receiver_not_test"};
      const resource = await provider.get(order.providerOrderId);
      const payment = verifyOrder(resource,order,order.collector);
      if (!payment || payment.id !== order.paymentId ||
          ordersState(resource,payment,order.expiresAt || "") !== "approved")
        return {ok:false,reason:"payment_not_confirmed"};
    } catch {
      return {ok:false,reason:"provider_verification_failed"};
    }
    return {ok:true,payload,order,job};
  }
  async function offer(id: string, playerOnline: boolean) {
    localOnly();
    if (playerOnline !== true) return hold("player_offline");
    const verified = await verify(id);
    if (!verified.ok) return hold(verified.reason);
    const {payload,order,job} = verified;
    const fingerprint = digest(payload);
    const ref = leases.doc(id);
    return db.runTransaction(async tx => {
      const [currentOrder,currentJob,existing] = await Promise.all([
        tx.get(orders.doc(order.id)),tx.get(jobs.doc(id)),tx.get(ref),
      ]);
      const o = currentOrder.data(), j = currentJob.data();
      if (!o || !j || o.state !== "approved" || j.state !== "pending" ||
          j.dispatchEnabled !== false || o.providerOrderId !== order.providerOrderId ||
          o.paymentId !== order.paymentId || o.receiverIsTestAccount !== true ||
          JSON.stringify(j.line) !== JSON.stringify(job.line) ||
          j.gamertag !== job.gamertag)
        return hold("order_changed_or_refunded");
      if (existing.exists) {
        const prior = existing.data();
        if (prior?.state === "blocked" || prior?.state === "refunded_after_ack" ||
            prior?.state === "refund_after_grant_review") return hold("blocked");
        if (prior?.fingerprint !== fingerprint) return hold("receipt_conflict");
        if (prior?.state === "acknowledged") return hold("already_acknowledged");
        // Ambiguous grant/ACK must not be silently retried. Core may have
        // applied it before the connection was interrupted.
        return hold(prior?.state === "offered" ? "manual_review_required" : "blocked");
      }
      tx.create(ref,{id,orderId:order.id,gamertag:job.gamertag,
        fingerprint,state:"offered",createdAt:new Date(clock()).toISOString(),
        attempts:1,source:"provider_reverified_test_order"});
      return {status:"offered" as const,payload};
    });
  }
  async function acknowledge(id: string, result: string) {
    localOnly();
    if (!validId(id) || !["applied","already_applied"].includes(result))
      return hold("executor_receipt_required");
    return db.runTransaction(async tx => {
      const ref=leases.doc(id), current=await tx.get(ref);
      if (!current.exists) return hold("offer_missing");
      const data=current.data();
      if (data?.state==="acknowledged") return {status:"acknowledged" as const,duplicate:true};
      if (data?.state!=="offered") return hold("blocked");
      const [order,job]=await Promise.all([
        tx.get(orders.doc(data.orderId)),tx.get(jobs.doc(id)),
      ]);
      if (order.data()?.state !== "approved" || job.data()?.state !== "pending" ||
          job.data()?.dispatchEnabled !== false) {
        tx.update(ref,{state:"refund_after_grant_review",
          reason:"refund_or_order_changed_after_offer"});
        return hold("refund_after_grant_review");
      }
      tx.update(ref,{state:"acknowledged",ackResult:result,
        acknowledgedAt:new Date(clock()).toISOString()});
      return {status:"acknowledged" as const,duplicate:false};
    });
  }
  async function block(id: string) {
    localOnly();
    if (!validId(id)) return hold("invalid_delivery_id");
    return db.runTransaction(async tx=>{
      const ref=leases.doc(id), snap=await tx.get(ref);
      if (!snap.exists) {
        tx.create(ref,{id,state:"blocked",createdAt:new Date(clock()).toISOString(),
          fingerprint:null,reason:"refund_or_chargeback"});
        return {status:"blocked" as const};
      }
      const state=snap.data()?.state;
      if(state==="acknowledged"){
        tx.update(ref,{state:"refunded_after_ack",reason:"manual_review_required"});
        return {status:"refunded_after_ack" as const};
      }
      if(state!=="blocked")tx.update(ref,{state:"blocked",reason:"refund_or_chargeback"});
      return {status:"blocked" as const};
    });
  }
  async function inspect(id: string) {
    localOnly();
    if (!validId(id)) return hold("invalid_delivery_id");
    const snap=await leases.doc(id).get();
    const data=snap.data();
    // Do not expose order/provider details or the gamertag in diagnostics.
    return {status:data?.state || "not_offered",attempts:data?.attempts || 0};
  }
  return {verify,offer,acknowledge,block,inspect};
}
