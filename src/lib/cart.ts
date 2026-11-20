import { Product, VIP } from "../types/index.ts";
export interface CartLine {
  productId: string;
  productType: "vip" | "product";
  quantity: number;
}
export const cartKey = (line: Pick<CartLine, "productId" | "productType">) =>
  `${line.productType}:${line.productId}`;
export function sanitizeCart(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  const lines: CartLine[] = [];
  const seen = new Set();
  for (const raw of value.slice(0, 100)) {
    if (
      !raw ||
      typeof raw.productId !== "string" ||
      !raw.productId ||
      raw.productId.includes("/") ||
      raw.productId.length > 128 ||
      !["vip", "product"].includes(raw.productType) ||
      !Number.isInteger(raw.quantity) ||
      raw.quantity < 1 ||
      raw.quantity > 64
    )
      continue;
    const key = cartKey(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({
      productId: raw.productId,
      productType: raw.productType,
      quantity: raw.productType === "vip" ? 1 : raw.quantity,
    });
  }
  return lines;
}
export function maxQuantity(item: VIP | Product, type: "vip" | "product") {
  const configured = Number((item as Product).maxQuantity);
  return type === "vip" || (item as Product).allowQuantity === false
    ? 1
    : Math.max(
        1,
        Math.min(
          64,
          Math.floor(
            Number.isFinite(configured) && configured > 0 ? configured : 64,
          ),
        ),
      );
}
export function resolveCart(
  lines: CartLine[],
  products: Product[],
  vips: VIP[],
) {
  return lines.map((line) => {
    const item = (line.productType === "vip" ? vips : products).find(
      (p) => p.id === line.productId,
    );
    return {
      ...line,
      item,
      available:
        !!item?.active && line.quantity <= maxQuantity(item, line.productType),
    };
  });
}

export function addCartLine(
  previous: CartLine[],
  item: VIP | Product,
  type: "vip" | "product",
): CartLine[] {
  if (!item.active) return previous;
  const line = { productId: item.id, productType: type, quantity: 1 };
  const exists = previous.some((l) => cartKey(l) === cartKey(line));
  return exists
    ? previous.map((l) =>
        cartKey(l) === cartKey(line)
          ? {
              ...l,
              quantity: Math.min(l.quantity + 1, maxQuantity(item, type)),
            }
          : l,
      )
    : [...previous, line].slice(0, 100);
}
