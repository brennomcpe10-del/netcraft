import { PixCheckout } from "../components/PixCheckout.tsx";
import React, { useEffect, useState } from "react";
import { Trash2, Minus, Plus, ArrowRight } from "lucide-react";
import { useCart } from "../context/CartContext.tsx";
import { cartKey, resolveCart, maxQuantity } from "../lib/cart.ts";
import { CartQuote } from "../lib/cartQuote.ts";
import { Product, VIP } from "../types/index.ts";
const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
export function CartView({
  products,
  vips,
  onShop,
}: {
  products: Product[];
  vips: VIP[];
  onShop: () => void;
}) {
  const { lines, remove, quantity } = useCart();
  const [quote, setQuote] = useState<CartQuote | null>(null),
    [error, setError] = useState(""),
    [checking, setChecking] = useState(false),
    [couponInput, setCouponInput] = useState(""),
    [couponCode, setCouponCode] = useState("");
  const signature = JSON.stringify(lines);
  useEffect(() => {
    const abort = new AbortController();
    setQuote(null);
    setError("");
    if (!lines.length) return;
    setChecking(true);
    fetch("/api/cart/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines, couponCode }),
      signal: abort.signal,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok)
          throw new Error(
            data.error || "Não foi possível conferir o carrinho.",
          );
        if (!abort.signal.aborted) setQuote(data);
      })
      .catch((err) => {
        if (!abort.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setChecking(false);
      });
    return () => abort.abort();
  }, [signature, couponCode]);
  const resolved = resolveCart(lines, products, vips);
  const subtotal = resolved.reduce(
    (sum, line) =>
      sum + (line.item ? Math.round(line.item.price * 100) * line.quantity : 0),
    0,
  );
  return (
    <section className="nc-container nc-section">
      <span className="eyebrow">SUA SELEÇÃO</span>
      <h1 className="catalog-title">Carrinho de compras</h1>
      {!lines.length ? (
        <div className="empty-state">
          <p>Seu carrinho está esperando sua próxima aventura.</p>
          <button className="nc-button" onClick={onShop}>
            Explorar loja
            <ArrowRight size={17} />
          </button>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-lines">
            {resolved.map((line) => (
              <article className="cart-line" key={cartKey(line)}>
                <div>
                  <span className="eyebrow">
                    {line.productType === "vip" ? "PLANO VIP" : "PRODUTO"}
                  </span>
                  <h2>{line.item?.name || "Produto não encontrado"}</h2>
                  {line.item && "duration" in line.item && (
                    <p>{line.item.duration}</p>
                  )}
                  <p>
                    {line.item
                      ? money(
                          quote?.lines.find(
                            (quoted) =>
                              quoted.productId === line.productId &&
                              quoted.productType === line.productType,
                          )?.unitCents ?? Math.round(line.item.price * 100),
                        )
                      : "—"}
                  </p>
                  {!line.available && (
                    <p className="cart-error">
                      Indisponível ou quantidade acima do limite.
                    </p>
                  )}
                </div>
                <div className="cart-line-actions">
                  <div className="quantity-controls">
                    <button
                      aria-label={`Diminuir ${line.item?.name || "produto"}`}
                      disabled={line.quantity <= 1}
                      onClick={() => quantity(cartKey(line), line.quantity - 1)}
                    >
                      <Minus size={15} />
                    </button>
                    <output aria-label="Quantidade">{line.quantity}</output>
                    <button
                      aria-label={`Aumentar ${line.item?.name || "produto"}`}
                      disabled={
                        !line.item ||
                        line.quantity >=
                          maxQuantity(line.item, line.productType)
                      }
                      onClick={() => quantity(cartKey(line), line.quantity + 1)}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={`Remover ${line.item?.name || "produto"}`}
                    onClick={() => remove(cartKey(line))}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <aside className="cart-summary">
            <h2>Resumo do carrinho</h2>
            <div>
              <span>Subtotal{!quote ? " estimado" : ""}</span>
              <strong>{money(quote?.subtotalCents ?? subtotal)}</strong>
            </div>
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                setCouponCode(couponInput.trim().toUpperCase());
              }}
            >
              <label htmlFor="cart-coupon" className="block text-sm">Cupom de desconto</label>
              <div className="flex flex-wrap gap-2 min-w-0">
                <input
                  id="cart-coupon"
                  type="text"
                  maxLength={50}
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded-xl bg-zinc-900 border border-white/10 p-3"
                  placeholder="Código (opcional)"
                  value={couponInput}
                  onChange={(event) => setCouponInput(event.target.value)}
                />
                <button type="submit" className="nc-button" disabled={checking}>
                  Conferir cupom
                </button>
              </div>
              {couponCode && (
                <button type="button" className="text-link" onClick={() => {
                  setCouponCode("");
                  setCouponInput("");
                }}>Remover cupom aplicado</button>
              )}
            </form>
            <div>
              <span>Descontos{quote?.discountCents ? " (conferidos)" : ""}</span>
              <strong>{quote ? money(-quote.discountCents) : "—"}</strong>
            </div>
            <div className="cart-total">
              <span>Total{!quote ? " estimado" : ""}</span>
              <strong>{money(quote?.totalCents ?? subtotal)}</strong>
            </div>
            {checking && (
              <p role="status">Conferindo preços, descontos e disponibilidade…</p>
            )}
            {quote?.discountCents ? (
              <p className="text-xs text-zinc-400">Valor revalidado no servidor ao gerar o Pix. Um cupom pode esgotar antes da cobrança.</p>
            ) : null}
            {error && (
              <p role="alert" className="cart-error">
                {error}
              </p>
            )}
            <PixCheckout
              lines={lines}
              couponCode={couponCode}
              disabled={
                !quote || checking || resolved.some((line) => !line.available)
              }
            />
            <button className="text-link" onClick={onShop}>
              Continuar comprando
              <ArrowRight size={16} />
            </button>
          </aside>
        </div>
      )}
    </section>
  );
}
