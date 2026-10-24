import React, { createContext, useContext, useEffect, useState } from "react";
import { CartLine, cartKey, sanitizeCart, addCartLine } from "../lib/cart.ts";
import { Product, VIP } from "../types/index.ts";
interface CartContextValue {
  lines: CartLine[];
  add: (item: VIP | Product, type: "vip" | "product") => void;
  remove: (key: string) => void;
  quantity: (key: string, value: number) => void;
  count: number;
}
const CartContext = createContext<CartContextValue | null>(null);
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => {
    try {
      return sanitizeCart(
        JSON.parse(localStorage.getItem("netcraft-cart-v1") || "[]"),
      );
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("netcraft-cart-v1", JSON.stringify(lines));
    } catch {}
  }, [lines]);
  return (
    <CartContext.Provider
      value={{
        lines,
        count: lines.reduce((sum, line) => sum + line.quantity, 0),
        add: (item, type) => {
          setLines((previous) => addCartLine(previous, item, type));
        },
        remove: (key) =>
          setLines((previous) => previous.filter((l) => cartKey(l) !== key)),
        quantity: (key, value) =>
          setLines((previous) =>
            previous.map((l) =>
              cartKey(l) === key
                ? {
                    ...l,
                    quantity:
                      l.productType === "vip"
                        ? 1
                        : Math.min(64, Math.max(1, Math.floor(value) || 1)),
                  }
                : l,
            ),
          ),
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("CartProvider ausente.");
  return context;
}
