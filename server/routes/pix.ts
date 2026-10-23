import { orderIdPattern } from "../payments/ordersContract.ts";
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
export function createPixRouter(
  dependencies = {
    database: paymentDatabase,
    gateway: () => new MercadoPago(),
    assertEnvironment: () => {
      testToken();
    },
    webhookSecret: () => process.env.MERCADOPAGO_WEBHOOK_SECRET || "",
  },
) {
  const pixRouter = express.Router();
  const idFor = (key: string) =>
    crypto.createHash("sha256").update(key).digest("hex");
  function service() {
    dependencies.assertEnvironment();
    return pixService(dependencies.database(), dependencies.gateway());
  }
  function failure(res: express.Response, e: unknown) {
    return res.status(e instanceof PixError ? e.status : 503).json({
      error:
        e instanceof PixError
          ? e.message
          : "Não foi possível confirmar a operação. Seu pedido não foi marcado como pago.",
    });
  }
  pixRouter.get("/pix/config", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    let stage = "environment";
    try {
      dependencies.assertEnvironment();
      stage = "provider";
      await dependencies.gateway().me();
      stage = "persistence";
      dependencies.database();
      return res.json({
        available: true,
        environment: "test",
        apiVersion: "orders-v1",
        realPayments: false,
      });
    } catch (error) {
      return res.status(503).json({
        available: false,
        environment: "test",
        realPayments: false,
        stage,
        reason:
          error instanceof PixError
            ? error.message
            : stage === "persistence"
              ? "A credencial de persistência do backend não pôde ser inicializada."
              : "Não foi possível consultar a API do Mercado Pago. Tente verificar novamente.",
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
      dependencies.assertEnvironment();
      const id = String(req.query["data.id"] || "");
      const requestId = String(req.headers["x-request-id"] || "");
      const signature = String(req.headers["x-signature"] || "");
      const secret = dependencies.webhookSecret();
      // Mercado Pago test simulator has been observed signing Orders using
      // original-case data.id. Allow this only for Preview test Orders; keep
      // the documented lowercase verification as the default everywhere.
      const documentedSignatureValid = webhookSignature(id, requestId, signature, secret);
      const previewOriginalCaseSignatureValid =
        !documentedSignatureValid &&
        process.env.VERCEL_ENV === "preview" &&
        /^ORDTST[A-Z0-9]{20,40}$/.test(id) &&
        (() => {
          const parts = Object.fromEntries(
            signature.split(",").map(part => part.trim().split("=")),
          );
          if (!secret || !requestId || !/^\d{10,13}$/.test(parts.ts || "") ||
              !/^[a-f0-9]{64}$/i.test(parts.v1 || "")) return false;
          const milliseconds = Number(parts.ts) * (parts.ts.length === 10 ? 1000 : 1);
          if (Math.abs(Date.now() - milliseconds) > 300000) return false;
          const expected = crypto.createHmac("sha256", secret)
            .update(`id:${id};request-id:${requestId};ts:${parts.ts};`)
            .digest();
          return crypto.timingSafeEqual(expected, Buffer.from(parts.v1, "hex"));
        })();
      if (!documentedSignatureValid && !previewOriginalCaseSignatureValid) {
        // Preview-only diagnostics: never log header values, secrets, request
        // bodies, identifiers or arbitrary provider-supplied text.
        if (process.env.VERCEL_ENV === "preview") {
          const signatureParts = Object.fromEntries(
            signature.split(",").map(part => part.trim().split("=")),
          );
          const ts = signatureParts.ts || "";
          const timestamp = /^[0-9]{10,13}$/.test(ts)
            ? Number(ts) * (ts.length === 10 ? 1000 : 1)
            : NaN;
          const reason = !secret ? "secret_missing"
            : !id ? "data_id_missing"
            : !requestId ? "request_id_missing"
            : !signature ? "signature_missing"
            : !Number.isFinite(timestamp) ? "timestamp_invalid"
            : Math.abs(Date.now() - timestamp) > 300000 ? "timestamp_outside_window"
            : !/^[a-f0-9]{64}$/i.test(signatureParts.v1 || "") ? "digest_invalid"
            : "signature_mismatch";
          // Log only categorical, non-sensitive properties. Never log IDs, signatures,
          // secrets, request headers, payloads or HMAC material.
          const queryIdShape = /^ORD[A-Z0-9]{20,40}$/.test(id)
            ? "order"
            : /^\\d+$/.test(id)
              ? "numeric"
              : id
                ? "other"
                : "missing";
          const bodyId = req.body?.data?.id;
          const bodyIdRelation = bodyId == null
            ? "absent"
            : String(bodyId) === id
              ? "match"
              : "mismatch";
          console.warn("[Pix webhook authentication]", {
            reason,
            queryIdShape,
            queryIdContainsUppercase: /[A-Z]/.test(id),
            bodyIdRelation,
            signatureTimestampUnit: ts.length === 10 ? "seconds" : ts.length === 13 ? "milliseconds" : "other",
            signaturePartsPresent: Boolean(signatureParts.ts && signatureParts.v1),
            requestIdPresent: Boolean(requestId),
            // Diagnostic only: never accept a request using the trimmed secret.
            secretHasOuterWhitespace: secret !== secret.trim(),
            trimmedSecretWouldMatch: secret !== secret.trim() &&
              webhookSignature(id, requestId, signature, secret.trim()),
            // Preview-only comparison: classify possible manifest differences.
            // Never log manifests/digests or use these probes to authorize requests.
            manifestVariantMatch: (() => {
              if (!secret || !/^[a-f0-9]{64}$/i.test(signatureParts.v1 || "") || !ts || !requestId || !id) return "not_tested";
              const variants: Array<[string, string]> = [
                ["original_case", `id:${id};request-id:${requestId};ts:${ts};`],
                ["no_final_semicolon", `id:${id.toLowerCase()};request-id:${requestId};ts:${ts}`],
                ["id_omitted", `request-id:${requestId};ts:${ts};`],
                ["request_id_omitted", `id:${id.toLowerCase()};ts:${ts};`],
                ["timestamp_omitted", `id:${id.toLowerCase()};request-id:${requestId};`],
              ];
              const received = Buffer.from(signatureParts.v1, "hex");
              const matched = variants.filter(([, manifest]) => {
                const digest = crypto.createHmac("sha256", secret).update(manifest).digest();
                return crypto.timingSafeEqual(digest, received);
              }).map(([name]) => name);
              return matched.length === 1 ? matched[0] : matched.length > 1 ? "multiple" : "none";
            })(),
          });
        }
        return res.status(401).json({ error: "Notificação não autenticada." });
      }
      const topic = String(req.query.type || req.body?.type || "");
      const isOrder = ["order", "orders"].includes(topic);
      if (!isOrder && topic !== "payment")
        return res
          .status(400)
          .json({ error: "Tópico de notificação incompatível." });
      if (isOrder && !orderIdPattern.test(id))
        return res
          .status(400)
          .json({ error: "Identificador de order inválido." });
      if (req.body?.data?.id && String(req.body.data.id) !== id)
        return res
          .status(400)
          .json({ error: "Identificadores da notificação divergentes." });
      const gateway = dependencies.gateway(),
        payment = isOrder
          ? await gateway.get(id)
          : await gateway.getLegacyPayment(id);
      const orderId = String(payment.external_reference || "");
      if (!/^[a-f0-9]{64}$/.test(orderId)) return res.sendStatus(204);
      const db = dependencies.database(),
        order = (
          await db.collection("pixTestOrders").doc(orderId).get()
        ).data();
      if (!order) return res.sendStatus(204);
      if (
        isOrder
          ? order.apiVersion !== "orders-v1" || order.providerOrderId !== id
          : order.apiVersion === "orders-v1" || order.paymentId !== id
      )
        throw new PixError("Pagamento não vinculado ao pedido.", 409);
      await pixService(db, gateway).reconcile(orderId);
      return res.sendStatus(204);
    } catch (e) {
      return failure(res, e);
    }
  });

  return pixRouter;
}
export const pixRouter = createPixRouter();
