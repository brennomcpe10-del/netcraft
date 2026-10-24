import crypto from "node:crypto";
import { PixError } from "./mercadoPago.ts";
export const orderIdPattern = /^ORD[A-Z0-9]{20,40}$/;
export const paymentIdPattern = /^PAY[A-Z0-9]{20,40}$/;
export function amountCents(value: unknown): number {
  if ((typeof value !== "string" && typeof value !== "number") || !/^\d{1,10}(\.\d{1,2})?$/.test(String(value)))
    throw new PixError(
      "Valor monetário inválido na resposta da Orders API.",
      409,
    );
  const [integer, fraction = ""] = String(value).split(".");
  const cents = Number(integer) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents))
    throw new PixError("Valor inválido na Orders API.", 409);
  return cents;
}
export const amountString = (cents: number) => {
  if (!Number.isSafeInteger(cents) || cents < 0)
    throw new PixError("Valor do pedido inválido.");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
};
export function providerKey(localId: string) {
  const hex = crypto
    .createHash("sha256")
    .update("netcraft-orders-v1:" + localId)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
// Allocate the server-authorized discount in cents. Split only a line's rounding remainder.
// Internal order lines retain original prices, quantities and rewards.
export function orderItems(
  order: any,
): {
  external_code: string;
  title: string;
  description: string;
  quantity: number;
  unit_price: number;
}[] {
  let remaining = order.totalCents,
    base = order.subtotalCents;
  return order.lines.flatMap((line: any) => {
    const net =
      base === line.lineCents
        ? remaining
        : Math.floor((remaining * line.lineCents) / base);
    base -= line.lineCents;
    remaining -= net;
    const low = Math.floor(net / line.quantity),
      higher = net % line.quantity;
    return [
      [line.quantity - higher, low],
      [higher, low + 1],
    ]
      .filter(([quantity, cents]) => quantity > 0 && cents > 0)
      .map(([quantity, cents]) => ({
        external_code: `${line.productType}:${line.productId}`.slice(0, 256),
        title: line.name.slice(0, 256),
        description: String(line.description || line.name).slice(0, 256),
        quantity,
        unit_price: cents / 100,
      }));
  });
}
export function orderRequest(
  order: any,
  payer: {
    email: string;
    first_name?: string;
    last_name?: string;
    identification?: { type: string; number: string };
  },
) {
  return {
    type: "online",
    external_reference: order.id,
    total_amount: amountString(order.totalCents),
    payer: {
      email: payer.email,
      ...(payer.first_name ? { first_name: payer.first_name } : {}),
      ...(payer.last_name ? { last_name: payer.last_name } : {}),
      ...(payer.identification ? { identification: payer.identification } : {}),
    },
    transactions: {
      payments: [
        {
          amount: amountString(order.totalCents),
          payment_method: { id: "pix", type: "bank_transfer" },
        },
      ],
    },
  };
}
export function verifyOrder(resource: any, order: any, collector: string) {
  if (
    !orderIdPattern.test(resource?.id || "") ||
    (order.providerOrderId && resource.id !== order.providerOrderId) ||
    resource.type !== "online" ||
    resource.external_reference !== order.id ||
    String(resource.user_id) !== String(collector) ||
    String(resource.user_id) !== String(order.collector) ||
    order.currency !== "BRL" ||
    !["BRA", "MLB"].includes(resource.country_code) ||
    (resource.currency_id !== undefined && resource.currency_id !== "BRL") ||
    amountCents(resource.total_amount) !== order.totalCents
  )
    throw new PixError(
      "A conferência da order falhou. Pedido não confirmado.",
      409,
    );
  // Orders responses do not require a live_mode field. The receiver is checked via /users/me.
  if (resource.live_mode === true && order.receiverIsTestAccount !== true)
    throw new PixError("Recebedor não autorizado para testes.", 409);
  const payments = resource.transactions?.payments;
  if (
    (payments === undefined || (Array.isArray(payments) && !payments.length)) &&
    ["created", "processing"].includes(resource.status)
  )
    return null;
  if (!Array.isArray(payments) || payments.length !== 1)
    throw new PixError("Quantidade inesperada de transações Pix.", 409);
  const payment = payments[0];
  if (
    !paymentIdPattern.test(payment?.id || "") ||
    (order.paymentId && payment.id !== order.paymentId) ||
    amountCents(payment.amount) !== order.totalCents ||
    payment.payment_method?.id !== "pix" ||
    payment.payment_method?.type !== "bank_transfer"
  )
    throw new PixError("Transação Pix divergente da order.", 409);
  return payment;
}
export function ordersState(
  resource: any,
  payment: any,
  expiresAt: string,
  now = Date.now(),
) {
  const details = [resource.status_detail, payment?.status_detail],
    statuses = [resource.status, payment?.status];
  if (
    statuses.some((s) => s === "refunded" || s === "charged_back") ||
    details.includes("partially_refunded")
  )
    return "refunded";
  if (details.includes("expired") || statuses.includes("expired"))
    return "expired";
  if (statuses.some((s) => s === "failed" || s === "canceled"))
    return "cancelled";
  if (
    resource.status === "processed" &&
    resource.status_detail === "accredited" &&
    payment?.status === "processed" &&
    payment.status_detail === "accredited"
  ) {
    if (
      amountCents(resource.total_paid_amount) !==
        amountCents(resource.total_amount) ||
      amountCents(payment.paid_amount) !== amountCents(payment.amount)
    )
      throw new PixError(
        "Order processada sem confirmação integral do valor recebido.",
        409,
      );
    return "approved";
  }
  if (resource.status === "processed")
    throw new PixError(
      "Status de aprovação ainda não confirmado em todos os níveis.",
      409,
    );
  if (Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) <= now)
    return "expired";
  return resource.status === "processing" ||
    resource.status === "created" ||
    !payment
    ? "processing"
    : "pending";
}
export function orderExpiry(resource: any, payment: any, fallback: string) {
  if (
    typeof payment?.date_of_expiration === "string" &&
    Number.isFinite(Date.parse(payment.date_of_expiration))
  )
    return new Date(payment.date_of_expiration).toISOString();
  if (
    typeof resource.created_date === "string" &&
    Number.isFinite(Date.parse(resource.created_date))
  )
    return new Date(
      Date.parse(resource.created_date) + 45 * 60000,
    ).toISOString();
  return fallback;
}
