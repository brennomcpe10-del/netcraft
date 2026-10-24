import QRCode from "qrcode";
import {
  orderRequest,
  verifyOrder,
  ordersState,
  orderExpiry,
  providerKey,
} from "./ordersContract.ts";
import crypto from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { validateRewardDraft } from "../../src/lib/rewardDraft.ts";
import { quoteCart, validateCartRequest } from "../../src/lib/cartQuote.ts";
import { readCatalogItem } from "../services/previewCatalog.ts";
import {
  MercadoPago,
  PixError,
  verifyPayment,
  paymentState,
  normalizeCpf,
} from "./mercadoPago.ts";
export function discounted(subtotal: number, c: any, now = Date.now()) {
  if (!c) return 0;
  if (
    c.active !== true ||
    (c.expiresAt &&
      (!Number.isFinite(Date.parse(c.expiresAt)) ||
        Date.parse(c.expiresAt) <= now)) ||
    (c.maxUses && Number(c.usedCount || 0) >= Number(c.maxUses)) ||
    subtotal < Math.round(Number(c.minOrderValue || 0) * 100) ||
    !Number.isFinite(c.discountValue) ||
    c.discountValue <= 0
  )
    throw new PixError("Cupom inválido, esgotado ou expirado.");
  if (
    !["percentage", "fixed"].includes(c.discountType) ||
    (c.discountType === "percentage" && c.discountValue > 100)
  )
    throw new PixError("Cupom inválido.");
  return Math.min(
    subtotal,
    Math.round(
      c.discountType === "percentage"
        ? (subtotal * c.discountValue) / 100
        : c.discountValue * 100,
    ),
  );
}
export function pixService(db: Firestore, gateway: MercadoPago) {
  const orders = db.collection("pixTestOrders"),
    jobs = db.collection("pixTestDeliveries");
  async function create(input: any, key: string) {
    validateCartRequest(input.lines);
    const cpf = normalizeCpf(input.cpf);
    if (!/^[a-zA-Z0-9-]{20,80}$/.test(key))
      throw new PixError("Identificador da compra inválido.");
    if (
      typeof input.gamertag !== "string" ||
      !/^.{3,32}$/.test(input.gamertag.trim()) ||
      typeof input.email !== "string" ||
      !/^[^\s@]{1,100}@[^\s@]{1,100}\.[^\s@]{2,30}$/.test(input.email) ||
      !/^\d{11}$/.test(cpf)
    )
      throw new PixError(
        "Informe gamertag, e-mail e CPF válidos para o teste.",
      );
    const id = crypto.createHash("sha256").update(key).digest("hex"),
      ref = orders.doc(id);
    const requestHash = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          lines: input.lines,
          gamertag: input.gamertag.trim(),
          email: input.email,
          cpf,
          couponCode: input.couponCode || "",
          first_name: typeof input.first_name === "string" && input.first_name.length<=100 ? input.first_name.trim() : "",
          last_name: typeof input.last_name === "string" && input.last_name.length<=100 ? input.last_name.trim() : "",
        }),
      )
      .digest("hex");
    const receiver = await gateway.me();
    const collector = String(receiver.id);
    if (!/^\d+$/.test(collector))
      throw new PixError("Recebedor de teste inválido.", 503);
    const order: any = await db.runTransaction(async (tx) => {
      const previous = await tx.get(ref);
      if (previous.exists) {
        const saved = previous.data()!;
        if (saved.apiVersion !== "orders-v1")
          throw new PixError(
            "Pedido anterior preservado na Payments API. Consulte esse pedido antes de iniciar uma nova compra.",
            409,
          );
        if (saved.requestHash !== requestHash)
          throw new PixError(
            "Este identificador já pertence a outra compra.",
            409,
          );
        return saved;
      }
      // The Pix quote resolves the EXACT same Preview overrides as storefront.
      // The transaction only reads from production; any sandbox purchase writes
      // remain in pixTestOrders and pixTestDeliveries.
      const items=await Promise.all(
        input.lines.map((line:any)=>
          readCatalogItem(line.productType==="vip"?"vips":"products",line.productId,tx)),
      );
      const quote=quoteCart(input.lines,items);
      items.forEach((item: any) => validateRewardDraft(item?.rewardDraft));
      let coupon: any = null,
        couponRef: any = null,
        couponReservations = 0;
      if (input.couponCode) {
        if (
          typeof input.couponCode !== "string" ||
          input.couponCode.length > 50
        )
          throw new PixError("Cupom inválido.");
        const found = await tx.get(
          db
            .collection("coupons")
            .where("code", "==", input.couponCode.trim().toUpperCase()),
        );
        if (found.size !== 1) throw new PixError("Cupom não encontrado.");
        const reservationRef = db
          .collection("pixTestCouponUsage")
          .doc(found.docs[0].id);
        couponRef = reservationRef;
        const usage = await tx.get(reservationRef);
        couponReservations = Number(usage.data()?.reservedCount || 0);
        const source = found.docs[0].data();
        coupon = {
          ...source,
          usedCount: Number(source.usedCount || 0) + couponReservations,
        };
      }
      const discountCents = discounted(quote.subtotalCents, coupon),
        totalCents = quote.subtotalCents - discountCents;
      if (totalCents < 1 || totalCents > 1000000)
        throw new PixError(
          "O total Pix deve ser positivo e não pode ultrapassar R$ 10.000.",
        );
      const saved = {
        id,
        requestHash,
        collector,
        apiVersion: "orders-v1",
        providerIdempotencyKey: providerKey(id),
        receiverIsTestAccount: receiver.netcraftTestAccount === true,
        totalCents,
        subtotalCents: quote.subtotalCents,
        discountCents,
        currency: "BRL",
        gamertag: input.gamertag.trim(),
        lines: quote.lines.map((l, i) => ({
          ...l,
          reward: items[i].rewardDraft || null,
          duration: items[i].duration || null,
        })),
        state: "creating",
        environment: "test",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 2700000).toISOString(),
        couponCode: coupon?.code || null,
      };
      if (couponRef)
        tx.set(couponRef, { reservedCount: couponReservations + 1 }); // reservation is retained on ambiguous gateway failures
      tx.create(ref, saved);
      return saved;
    });
    if (!order.providerOrderId) {
      const payer: any = {
        email: input.email,
        identification: { type: "CPF", number: cpf },
      };
      for (const field of ["first_name", "last_name"]) {
        if (
          typeof input[field] === "string" &&
          input[field].trim() &&
          input[field].length <= 100
        )
          payer[field] = input[field].trim();
      }
      // Preview sandbox Orders must use the provider's known-good APRO payer
      // fixture. Never send a shopper's CPF/email to a sandbox transaction.
      // This does not change stored order ownership or the amount.
      // Refuse the fixture unless the provider confirms a test receiver.
      const previewSandbox = process.env.VERCEL_ENV === "preview";
      if (previewSandbox && receiver.netcraftTestAccount !== true)
        throw new PixError("Recebedor não identificado como conta de teste.", 503);
      const providerPayer = previewSandbox
        ? { email: "test_payer@example.com", first_name: "APRO" }
        : payer;
      const resource = await gateway.create(
        orderRequest(order, providerPayer),
        order.providerIdempotencyKey,
      );
      const payment = verifyOrder(resource, order, collector);
      // Bind the provider order immediately, including asynchronous responses without QR/payment.
      // POST never approves a local order. Only the subsequent authenticated GET can approve it.
      await db.runTransaction(async (tx) => {
        const current = (await tx.get(ref)).data()!;
        if (current.providerOrderId && current.providerOrderId !== resource.id)
          throw new PixError("Conflito de order.", 409);
        verifyOrder(resource, current, collector);
        if (!current.providerOrderId)
          tx.update(ref, {
            providerOrderId: resource.id,
            paymentId: payment?.id || null,
            state: "processing",
            expiresAt: orderExpiry(resource, payment, current.expiresAt),
          });
      });
    }
    await reconcile(id);
    return view(id);
  }
  async function reconcile(id: string) {
    const saved = (await orders.doc(id).get()).data();
    if (!saved) return;
    if (saved.apiVersion !== "orders-v1") return reconcileLegacy(id, saved);
    if (!saved.providerOrderId) return;
    const receiver = await gateway.me(),
      resource = await gateway.get(saved.providerOrderId);
    const payment = verifyOrder(resource, saved, String(receiver.id));
    let qrCode = payment?.payment_method?.qr_code || "",
      qrBase64 = payment?.payment_method?.qr_code_base64 || "";
    if (
      typeof qrCode !== "string" ||
      qrCode.length > 10000 ||
      typeof qrBase64 !== "string" ||
      qrBase64.length > 500000
    )
      throw new PixError("QR Code inválido na resposta da Orders API.", 502);
    if (qrBase64 && !/^[A-Za-z0-9+/=]+$/.test(qrBase64))
      throw new PixError("Imagem Pix inválida.", 502);
    // The official Pix sandbox may return an empty base64 image. Encode its verified copy/paste code.
    if (qrCode && !qrBase64)
      qrBase64 = (
        await QRCode.toDataURL(qrCode, { width: 300, margin: 2 })
      ).split(",")[1];
    await db.runTransaction(async (tx) => {
      const ref = orders.doc(id),
        o = (await tx.get(ref)).data()!;
      const payment = verifyOrder(resource, o, String(receiver.id));
      const expiresAt = orderExpiry(resource, payment, o.expiresAt);
      let state = ordersState(resource, payment, expiresAt);
      const providerUpdatedAt = Number.isFinite(
        Date.parse(resource.last_updated_date),
      )
        ? new Date(resource.last_updated_date).toISOString()
        : null;
      if (
        o.providerStatusUpdatedAt &&
        providerUpdatedAt &&
        Date.parse(providerUpdatedAt) < Date.parse(o.providerStatusUpdatedAt)
      )
        return;
      if (o.state === "refunded") state = "refunded";
      else if (o.state === "approved" && state !== "refunded")
        state = "approved";
      // Orders API documents last_updated_date, not an immutable approval timestamp.
      // Record observation separately; never start a future VIP timer from an invented date.
      const approvedAt = o.approvedAt || null;
      const approvalObservedAt =
        o.approvalObservedAt ||
        (state === "approved" ? new Date().toISOString() : null);
      const jobRefs = o.lines.map((_: any, i: number) =>
        jobs.doc(`${id}-${i}`),
      );
      const eventData = {
        state,
        providerStatus: resource.status,
        transactionStatus: payment?.status || null,
        providerUpdatedAt,
        paymentId: payment?.id || null,
      };
      const eventId = crypto
          .createHash("sha256")
          .update(JSON.stringify(eventData))
          .digest("hex"),
        eventRef = ref.collection("events").doc(eventId);
      const snapshots = await Promise.all(jobRefs.map((r: any) => tx.get(r))),
        event = await tx.get(eventRef);
      if (state === "approved")
        o.lines.forEach((line: any, i: number) => {
          if (!snapshots[i].exists)
            tx.create(jobRefs[i], {
              id: jobRefs[i].id,
              orderId: id,
              lineIndex: i,
              gamertag: o.gamertag,
              line,
              approvedAt,
              approvalObservedAt,
              requiresApprovalTimestamp: !approvedAt,
              state: "pending",
              environment: "test",
              dispatchEnabled: false,
              attempts: 0,
              createdAt: new Date().toISOString(),
            });
        });
      if (state === "refunded")
        snapshots.forEach((snap: any) => {
          if (snap.exists)
            tx.update(snap.ref, {
              state: "blocked",
              reason: "refund_or_chargeback",
            });
        });
      tx.update(ref, {
        state,
        approvedAt,
        approvalObservedAt,
        requiresApprovalTimestamp: state === "approved" && !approvedAt,
        updatedAt: new Date().toISOString(),
        providerStatus: resource.status,
        providerStatusDetail: resource.status_detail || null,
        transactionStatus: payment?.status || null,
        providerStatusUpdatedAt: providerUpdatedAt,
        paymentId: payment?.id || o.paymentId || null,
        expiresAt,
        ...(qrCode ? { qrCode } : {}),
        ...(qrBase64 ? { qrBase64 } : {}),
      });
      if (!event.exists)
        tx.create(eventRef, {
          ...eventData,
          recordedAt: new Date().toISOString(),
          source: "authenticated_orders_get",
        });
    });
  }
  async function reconcileLegacy(id: string, saved: any) {
    if (!saved.paymentId) return;
    const payment = await gateway.getLegacyPayment(saved.paymentId);
    verifyPayment(payment, saved, String((await gateway.me()).id));
    await db.runTransaction(async (tx) => {
      const ref = orders.doc(id),
        o = (await tx.get(ref)).data()!;
      verifyPayment(payment, o, o.collector);
      let state = paymentState(payment);
      if (o.state === "refunded") state = "refunded";
      else if (o.approvedAt && state !== "refunded") state = "approved";
      // Preserve legacy timestamps and outbox. New legacy fulfillment is never dispatched.
      const approvedAt =
        o.approvedAt ||
        (state === "approved"
          ? new Date(payment.date_approved).toISOString()
          : null);
      const refs = o.lines.map((_: any, i: number) => jobs.doc(`${id}-${i}`)),
        snaps = await Promise.all(refs.map((r: any) => tx.get(r)));
      if (state === "approved")
        o.lines.forEach((line: any, i: number) => {
          if (!snaps[i].exists)
            tx.create(refs[i], {
              id: refs[i].id,
              orderId: id,
              lineIndex: i,
              gamertag: o.gamertag,
              line,
              approvedAt,
              state: "pending",
              environment: "test",
              dispatchEnabled: false,
              attempts: 0,
            });
        });
      if (state === "refunded")
        snaps.forEach((s: any) => {
          if (s.exists)
            tx.update(s.ref, {
              state: "blocked",
              reason: "refund_or_chargeback",
            });
        });
      tx.update(ref, {
        state,
        approvedAt,
        updatedAt: new Date().toISOString(),
        providerStatus: payment.status,
      });
    });
  }
  async function view(id: string) {
    const o = (await orders.doc(id).get()).data();
    if (!o) throw new PixError("Pedido não encontrado.", 404);
    return {
      id: o.id,
      state: o.state,
      apiVersion: o.apiVersion || "payments-legacy",
      providerOrderId: o.providerOrderId || null,
      paymentId: o.paymentId || null,
      approvalObservedAt: o.approvalObservedAt || null,
      requiresApprovalTimestamp: o.requiresApprovalTimestamp || false,
      environment: "test",
      totalCents: o.totalCents,
      subtotalCents: o.subtotalCents,
      discountCents: o.discountCents,
      lines: o.lines.map(({ reward, ...line }: any) => line),
      qrCode: o.qrCode,
      qrBase64: o.qrBase64,
      expiresAt: o.expiresAt,
      approvedAt: o.approvedAt || null,
      delivery: "Integração Minecraft desativada no ambiente de teste.",
    };
  }
  return { create, reconcile, view };
}
