import express from "express";
import crypto from "node:crypto";
import {
  MercadoPago,
  PixError,
  testToken,
  webhookSignature,
} from "../payments/mercadoPago.ts";
import { paymentDatabase } from "../payments/database.ts";
import { pixService } from "../payments/service.ts";
export const pixRouter = express.Router();
const idFor = (key: string) =>
  crypto.createHash("sha256").update(key).digest("hex");
function service() {
  testToken();
  return pixService(paymentDatabase(), new MercadoPago());
}
function failure(res: express.Response, e: unknown) {
  return res
    .status(e instanceof PixError ? e.status : 503)
    .json({
      error:
        e instanceof PixError
          ? e.message
          : "Não foi possível confirmar a operação. Seu pedido não foi marcado como pago.",
    });
}
pixRouter.get("/pix/config", async (_req, res) => {
  res.setHeader("Cache-Control","no-store");
  let stage = "environment";
  try {
    testToken();
    stage = "provider";
    await new MercadoPago().me();
    stage = "persistence";
    paymentDatabase();
    return res.json({available:true,environment:"test",realPayments:false});
  } catch (error) {
    return res.status(503).json({
      available:false,environment:"test",realPayments:false,stage,
      reason:error instanceof PixError ? error.message :
        stage === "persistence" ? "A credencial de persistência do backend não pôde ser inicializada." :
        "Não foi possível consultar a API do Mercado Pago. Tente verificar novamente."
    });
  }
});
pixRouter.post("/pix/orders", async (req, res) => {
  try {
    const key = String(req.headers["idempotency-key"] || "");
    const result = await service().create(req.body, key);
    res.setHeader("Cache-Control", "no-store");
    return res.status(201).json(result);
  } catch (e) {
    return failure(res, e);
  }
});
pixRouter.get("/pix/orders/:id", async (req, res) => {
  try {
    const key = String(req.headers["x-checkout-key"] || "");
    if (!key || idFor(key) !== req.params.id)
      return res.status(401).json({ error: "Acesso restrito ao comprador." });
    const api = service();
    await api.reconcile(req.params.id);
    res.setHeader("Cache-Control", "no-store");
    return res.json(await api.view(req.params.id));
  } catch (e) {
    return failure(res, e);
  }
});
pixRouter.post("/pix/webhook", async (req, res) => {
  try {
    testToken();
    const id = String(req.query["data.id"] || "");
    if (
      !webhookSignature(
        id,
        String(req.headers["x-request-id"] || ""),
        String(req.headers["x-signature"] || ""),
        process.env.MERCADOPAGO_WEBHOOK_SECRET || "",
      )
    )
      return res.status(401).json({ error: "Notificação não autenticada." });
    const gateway = new MercadoPago(),
      payment = await gateway.get(id);
    const orderId = String(payment.external_reference || "");
    if (!/^[a-f0-9]{64}$/.test(orderId)) return res.sendStatus(204);
    const db = paymentDatabase(),
      order = (await db.collection("pixTestOrders").doc(orderId).get()).data();
    if (!order) return res.sendStatus(204);
    if (order.paymentId !== id)
      throw new PixError("Pagamento não vinculado ao pedido.", 409);
    await pixService(db, gateway).reconcile(orderId);
    return res.sendStatus(204);
  } catch (e) {
    return failure(res, e);
  }
});
