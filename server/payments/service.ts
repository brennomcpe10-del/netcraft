import crypto from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { validateRewardDraft } from "../../src/lib/rewardDraft.ts";
import { quoteCart, validateCartRequest } from "../../src/lib/cartQuote.ts";
import {
  MercadoPago,
  PixError,
  verifyPayment,
  paymentState,
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
    if (!/^[a-zA-Z0-9-]{20,80}$/.test(key))
      throw new PixError("Identificador da compra inválido.");
    if (
      typeof input.gamertag !== "string" ||
      !/^.{3,32}$/.test(input.gamertag.trim()) ||
      typeof input.email !== "string" ||
      !/^[^\s@]{1,100}@[^\s@]{1,100}\.[^\s@]{2,30}$/.test(input.email) ||
      !/^\d{11}$/.test(input.cpf || "")
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
          cpf: input.cpf,
          couponCode: input.couponCode || "",
        }),
      )
      .digest("hex");
    const collector = String((await gateway.me()).id);
    if (!/^\d+$/.test(collector))
      throw new PixError("Recebedor de teste inválido.", 503);
    const order: any = await db.runTransaction(async (tx) => {
      const previous = await tx.get(ref);
      if (previous.exists) {
        const saved = previous.data()!;
        if (saved.requestHash !== requestHash)
          throw new PixError(
            "Este identificador já pertence a outra compra.",
            409,
          );
        return saved;
      }
      const docs = await Promise.all(
        input.lines.map((l: any) =>
          tx.get(
            db
              .collection(l.productType === "vip" ? "vips" : "products")
              .doc(l.productId),
          ),
        ),
      );
      const items = docs.map((s: any) =>
          s.exists ? { ...s.data(), id: s.id } : null,
        ),
        quote = quoteCart(input.lines, items);
      items.forEach((item: any) => validateRewardDraft(item?.rewardDraft));
      let coupon: any = null,
        couponRef: any = null;
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
        coupon = found.docs[0].data();
        couponRef = found.docs[0].ref;
      }
      const discountCents = discounted(quote.subtotalCents, coupon),
        totalCents = quote.subtotalCents - discountCents;
      if (totalCents < 100 || totalCents > 1000000)
        throw new PixError("O total Pix deve estar entre R$ 1 e R$ 10.000.");
      const saved = {
        id,
        requestHash,
        collector,
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
        expiresAt: new Date(Date.now() + 1800000).toISOString(),
        couponCode: coupon?.code || null,
      };
      if (couponRef)
        tx.update(couponRef, { usedCount: Number(coupon.usedCount || 0) + 1 }); // reservation is retained on ambiguous gateway failures
      tx.create(ref, saved);
      return saved;
    });
    if (!order.paymentId) {
      const p = await gateway.create(
        {
          transaction_amount: order.totalCents / 100,
          payment_method_id: "pix",
          description: `NetCraftBR teste ${id.slice(0, 8)}`,
          external_reference: id,
          metadata: { netcraft_order_id: id },
          date_of_expiration: order.expiresAt,
          ...(process.env.VERCEL_BRANCH_URL &&
          /^[a-zA-Z0-9.-]+\.vercel\.app$/.test(process.env.VERCEL_BRANCH_URL)
            ? {
                notification_url: `https://${process.env.VERCEL_BRANCH_URL}/api/pix/webhook`,
              }
            : {}),
          payer: {
            email: input.email,
            identification: { type: "CPF", number: input.cpf },
          },
        },
        id,
      );
      // Fail closed before publishing any QR code.
      verifyPayment(p, { ...order, paymentId: String(p.id) }, collector);
      const qr = p.point_of_interaction?.transaction_data;
      if (
        typeof qr?.qr_code !== "string" ||
        !qr.qr_code ||
        typeof qr?.qr_code_base64 !== "string" ||
        !/^[A-Za-z0-9+/=]+$/.test(qr.qr_code_base64) ||
        qr.qr_code_base64.length > 500000
      )
        throw new PixError(
          "O ambiente de teste não retornou um QR Code Pix válido.",
          502,
        );
      await db.runTransaction(async (tx) => {
        const current = (await tx.get(ref)).data()!;
        if (current.paymentId && current.paymentId !== String(p.id))
          throw new PixError("Conflito de pagamento.", 409);
        tx.update(ref, {
          paymentId: String(p.id),
          qrCode: qr.qr_code,
          qrBase64: qr.qr_code_base64,
          expiresAt:
            typeof p.date_of_expiration === "string" &&
            Number.isFinite(Date.parse(p.date_of_expiration))
              ? p.date_of_expiration
              : order.expiresAt,
          state: current.paymentId ? current.state : "pending",
        });
      });
    }
    await reconcile(id);
    return view(id);
  }
  async function reconcile(id: string) {
    const saved = (await orders.doc(id).get()).data();
    if (!saved?.paymentId) return;
    const payment = await gateway.get(saved.paymentId);
    verifyPayment(payment, saved, String((await gateway.me()).id));
    await db.runTransaction(async (tx) => {
      const ref = orders.doc(id),
        o = (await tx.get(ref)).data()!;
      verifyPayment(payment, o, o.collector);
      // A stale pending event may never undo an approval/refund. Provider lookup is authoritative.
      let state = paymentState(payment);
      if (o.state === "refunded") state = "refunded";
      else if (o.approvedAt && state !== "refunded") state = "approved";
      const approvedAt =
        o.approvedAt ||
        (state === "approved"
          ? new Date(payment.date_approved).toISOString()
          : null);
      const jobRefs = o.lines.map((_: any, i: number) =>
        jobs.doc(`${id}-${i}`),
      );
      const snapshots = await Promise.all(jobRefs.map((r: any) => tx.get(r)));
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
              state: "pending",
              environment: "test",
              dispatchEnabled: false,
              attempts: 0,
              createdAt: new Date().toISOString(),
            });
        });
      if (state === "refunded")
        snapshots.forEach((s: any) => {
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
        refundedCents: Math.round(
          Number(payment.transaction_amount_refunded || 0) * 100,
        ),
      });
    });
  }
  async function view(id: string) {
    const o = (await orders.doc(id).get()).data();
    if (!o) throw new PixError("Pedido não encontrado.", 404);
    return {
      id: o.id,
      state: o.state,
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
