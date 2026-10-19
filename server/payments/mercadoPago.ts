import crypto from "node:crypto";
export class PixError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function testToken(env = process.env) {
  if (
    env.VERCEL_ENV === "production" ||
    !env.MERCADOPAGO_ACCESS_TOKEN?.startsWith("TEST-")
  )
    throw new PixError(
      "Pix de teste indisponível. Pagamentos reais estão desativados.",
      503,
    );
  return env.MERCADOPAGO_ACCESS_TOKEN;
}
export class MercadoPago {
  constructor(
    private token = testToken(),
    private transport: typeof fetch = fetch,
  ) {}
  async request(path: string, body?: unknown, key?: string) {
    const response = await this.transport(
      `https://api.mercadopago.com${path}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          ...(key ? { "X-Idempotency-Key": key } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15000),
      },
    );
    const data = await response.json();
    if (!response.ok)
      throw new PixError(
        "Mercado Pago não aceitou a operação de teste. Nenhum pagamento foi confirmado. Tente novamente com o mesmo pedido.",
        502,
      );
    return data;
  }
  me() {
    return this.request("/users/me");
  }
  create(body: unknown, key: string) {
    return this.request("/v1/payments", body, key);
  }
  get(id: string) {
    if (!/^\d{1,30}$/.test(id)) throw new PixError("Pagamento inválido.");
    return this.request(`/v1/payments/${id}`);
  }
}
export function webhookSignature(
  id: string,
  requestId: string,
  signature: string,
  secret: string,
  now = Date.now(),
) {
  const parts = Object.fromEntries(
    signature.split(",").map((p) => p.trim().split("=")),
  );
  if (
    !secret ||
    !requestId ||
    !/^\d{10,13}$/.test(parts.ts || "") ||
    !/^\w+$/.test(id) ||
    !/^[a-f0-9]{64}$/i.test(parts.v1 || "")
  )
    return false;
  const millis = Number(parts.ts) * (parts.ts.length === 10 ? 1000 : 1);
  if (Math.abs(now - millis) > 300000) return false;
  const digest = crypto
    .createHmac("sha256", secret)
    .update(`id:${id.toLowerCase()};request-id:${requestId};ts:${parts.ts};`)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(digest, "hex"),
    Buffer.from(parts.v1, "hex"),
  );
}
export function verifyPayment(payment: any, order: any, collector: string) {
  if (
    String(payment.id) !== String(order.paymentId) ||
    payment.external_reference !== order.id ||
    String(payment.collector_id) !== collector ||
    payment.currency_id !== "BRL" ||
    payment.payment_method_id !== "pix" ||
    payment.live_mode !== false ||
    Math.round(Number(payment.transaction_amount) * 100) !== order.totalCents ||
    payment.metadata?.netcraft_order_id !== order.id
  )
    throw new PixError(
      "A conferência do pagamento falhou. Pedido não confirmado.",
      409,
    );
  if (
    payment.status === "approved" &&
    (!payment.date_approved ||
      !Number.isFinite(Date.parse(payment.date_approved)))
  )
    throw new PixError("Aprovação sem data válida.", 409);
}
export function paymentState(p: any, now = Date.now()) {
  if (p.status === "approved")
    return Number(p.transaction_amount_refunded) > 0 ? "refunded" : "approved";
  if (["refunded", "charged_back"].includes(p.status)) return "refunded";
  if (["cancelled", "rejected"].includes(p.status)) return "cancelled";
  if (p.date_of_expiration && Date.parse(p.date_of_expiration) <= now)
    return "expired";
  return "pending";
}
