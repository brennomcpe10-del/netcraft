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
  if (env.VERCEL_ENV === "production")
    throw new PixError(
      "Esta URL é de produção. Abra a Preview da branch redesign-mobile-solaris para testar o Pix.",
      503,
    );
  const token = env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!token)
    throw new PixError(
      "O backend desta versão não recebeu MERCADOPAGO_ACCESS_TOKEN. A cobrança não foi iniciada.",
      503,
    );
  if (!/^(TEST-|APP_USR-)/.test(token))
    throw new PixError(
      "O backend recebeu uma credencial de formato incompatível. É necessário o Access Token privado do Mercado Pago.",
      503,
    );
  return token;
}
export function normalizeCpf(value: unknown) {
  return typeof value === "string" && /^[\d.\s-]+$/.test(value)
    ? value.replace(/\D/g, "")
    : "";
}
// Only schema identifiers are eligible for diagnostics. Never sanitize arbitrary
// provider text into an identifier: reject it instead (it may contain payer data).
const diagnosticFields = new Set([
  "type", "processing_mode", "external_reference", "total_amount", "payer",
  "email", "first_name", "last_name", "identification", "number", "items",
  "external_code", "title", "description", "quantity", "unit_price",
  "transactions", "payments", "amount", "payment_method", "id", "expiration_time",
  "notification_url", "currency_id", "statement_descriptor", "metadata",
]);
const diagnosticCodes = new Set([
  "property_type", "property_value", "property_required", "required_property",
  "invalid_property", "invalid_type", "invalid_value", "required",
  "property_format", "property_length", "invalid_length", "property_not_allowed",
]);
export function validationDiagnostics(data: unknown) {
  const properties = new Set<string>(), codes = new Set<string>();
  const record = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown> : null;
  const inspect = (value: unknown) => {
    const entry = record(value);
    if (!entry) return;
    for (const key of ["property", "field", "path"]) {
      const path = entry[key];
      if (typeof path !== "string" || path.length > 160 ||
          !/^[a-z_]+(?:\[\d{1,3}\])?(?:\.[a-z_]+(?:\[\d{1,3}\])?)*$/.test(path)) continue;
      const segments = path.replace(/\[\d+\]/g, "").split(".");
      if (segments.every(segment => diagnosticFields.has(segment))) properties.add(path);
    }
    for (const key of ["code", "error_code", "validation_code"]) {
      const code = entry[key];
      if (typeof code === "string" && diagnosticCodes.has(code)) codes.add(code);
    }
  };
  const root = record(data);
  const errors = root?.errors;
  if (Array.isArray(errors)) for (const error of errors.slice(0, 20)) {
    inspect(error);
    const details = record(error)?.details;
    if (Array.isArray(details)) for (const detail of details.slice(0, 30)) inspect(detail);
  }
  return { properties: [...properties].slice(0, 30), codes: [...codes].slice(0, 30) };
}
export class MercadoPago {
  constructor(
    private token = testToken(),
    private transport: typeof fetch = fetch,
  ) {}
  async request(path: string, body?: unknown, key?: string) {
    // Check the account BEFORE any payment mutation, even for direct callers.
    if (body) await this.me();
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
    if (!response.ok) {
      if (process.env.VERCEL_ENV === "preview") {
        const diagnostic = validationDiagnostics(data);
        if (diagnostic.properties.length || diagnostic.codes.length)
          console.warn("[MercadoPago validation]", diagnostic);
      }
      const details =
        response.status === 401 || response.status === 403
          ? "A API do Mercado Pago recusou a autenticação da credencial desta versão."
          : "A API do Mercado Pago recusou a operação de teste.";
      const safeOperation =
        path === "/users/me"
          ? "verificação da conta (/users/me)"
          : path === "/v1/orders"
            ? "criação da order (/v1/orders)"
            : path.startsWith("/v1/orders/")
              ? "consulta da order (/v1/orders/:id)"
              : path.startsWith("/v1/payments/")
                ? "consulta de pagamento histórico"
                : "operação da API";
      throw new PixError(
        details +
          " Etapa: " +
          safeOperation +
          ". HTTP " +
          response.status +
          ". Nenhum pagamento foi confirmado.",
        502,
      );
    }
    return data;
  }
  async me() {
    const account = await this.request("/users/me");
    const isTestAccount =
      Array.isArray(account.tags) && account.tags.includes("test_user");
    if (!/^\d+$/.test(String(account.id)))
      throw new PixError("A API não identificou o recebedor de teste.", 503);
    if (this.token.startsWith("APP_USR-") && !isTestAccount)
      throw new PixError(
        "A credencial pertence a uma conta real ou não pôde ser identificada como conta de teste. Cobranças reais permanecem bloqueadas.",
        503,
      );
    return { ...account, netcraftTestAccount: isTestAccount };
  }
  create(body: unknown, key: string) {
    return this.request("/v1/orders", body, key);
  }
  get(id: string) {
    if (!/^ORD[A-Z0-9]{20,40}$/.test(id)) throw new PixError("Order inválida.");
    return this.request(`/v1/orders/${id}`);
  }
  // Read-only compatibility for historical records. Never create a legacy payment.
  getLegacyPayment(id: string) {
    if (!/^\d{1,30}$/.test(id))
      throw new PixError("Pagamento legado inválido.");
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
    (payment.live_mode !== false &&
      !(payment.live_mode === true && order.receiverIsTestAccount === true)) ||
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
