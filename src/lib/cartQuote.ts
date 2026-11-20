import { Product, VIP } from "../types/index.ts";
import { CartLine, cartKey, maxQuantity } from "./cart.ts";

export class CartQuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CartQuoteError";
  }
}
export function validateCartRequest(
  value: unknown,
): asserts value is CartLine[] {
  if (!Array.isArray(value) || !value.length || value.length > 100)
    throw new CartQuoteError("Carrinho vazio ou muito grande.");
  const seen = new Set();
  for (const line of value) {
    if (
      !line ||
      Object.keys(line).some(
        (key) => !["productId", "productType", "quantity"].includes(key),
      ) ||
      typeof line.productId !== "string" ||
      !line.productId ||
      line.productId.length > 128 ||
      line.productId.includes("/") ||
      !["vip", "product"].includes(line.productType) ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 64 ||
      seen.has(cartKey(line))
    )
      throw new CartQuoteError("Itens do carrinho inválidos.");
    seen.add(cartKey(line));
  }
}
export function quoteCart(lines: CartLine[], items: (VIP | Product | null)[]) {
  validateCartRequest(lines);
  let subtotalCents = 0;
  const quoted = lines.map((line, i) => {
    const item = items[i];
    if (!item || item.id !== line.productId || item.active !== true)
      throw new CartQuoteError("Um produto está indisponível. Remova-o do carrinho.");
    if (line.quantity > maxQuantity(item, line.productType))
      throw new CartQuoteError("Quantidade não permitida para este produto.");
    if (typeof item.price !== "number") throw new CartQuoteError("Preço indisponível.");
    const unitCents = Math.round(item.price * 100);
    if (!Number.isSafeInteger(unitCents) || unitCents < 0)
      throw new CartQuoteError("Preço indisponível.");
    subtotalCents += unitCents * line.quantity;
    if (!Number.isSafeInteger(subtotalCents))
      throw new CartQuoteError("Valor do carrinho inválido.");
    return {
      ...line,
      name: item.name,
      unitCents,
      lineCents: unitCents * line.quantity,
    };
  });
  return {
    lines: quoted,
    subtotalCents,
    discountCents: 0,
    totalCents: subtotalCents,
    currency: "BRL",
    couponsAvailable: false,
    combinedPaymentAvailable: false,
  };
}
export type CartQuote = ReturnType<typeof quoteCart>;
