import React, { act } from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { StoreView } from "../src/views/StoreView.tsx";
import { CartProvider, useCart } from "../src/context/CartContext.tsx";
import { Product, VIP } from "../src/types/index.ts";
const vip: VIP = {
  id: "fixture-vip",
  name: "Explorer",
  price: 4.9,
  duration: "30 dias",
  description: "Plano de teste isolado",
  benefits: ["Benefício de teste"],
  color: "emerald",
  image: "crown",
  order: 1,
  active: true,
};
const farm: Product = {
  id: "fixture-farm",
  name: "Farm do teste",
  price: 9.9,
  category: "farms",
  description: "Produto apenas do teste",
  image: "cube",
  active: true,
  highlights: ["Conteúdo do kit"],
  order: 1,
  maxQuantity: 2,
};
function TestShop() {
  const cart = useCart();
  return (
    <>
      <output data-testid="cart-count">{cart.count}</output>
      <StoreView
        products={[farm]}
        vips={[vip]}
        loading={false}
        onBuyItem={cart.add}
      />
    </>
  );
}
test("navigate category → product → back; retain mixed cart through navigation and remount", async () => {
  const browser = new Window({ url: "http://localhost" });
  const globals = globalThis as any;
  const previous = {
    window: globals.window,
    document: globals.document,
    HTMLElement: globals.HTMLElement,
    localStorage: globals.localStorage,
    IS_REACT_ACT_ENVIRONMENT: globals.IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globals, {
    window: browser,
    document: browser.document,
    HTMLElement: browser.HTMLElement,
    localStorage: browser.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  browser.scrollTo = () => {};
  const { createRoot } = await import("react-dom/client");
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  let root = createRoot(container as unknown as HTMLElement);
  const click = async (text: string) => {
    const button = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent.includes(text),
    );
    assert.ok(button, `Button available: ${text}`);
    await act(async () => {
      button.dispatchEvent(new browser.MouseEvent("click", { bubbles: true }));
    });
  };
  try {
    await act(async () =>
      root.render(
        <CartProvider>
          <TestShop />
        </CartProvider>,
      ),
    );
    assert.ok(container.textContent.includes("CATEGORIAS DA LOJA"));
    assert.ok(!container.querySelector(".product-card"));
    await click("KITS FARM");
    assert.ok(container.textContent.includes("Farm do teste"));
    assert.ok(!container.textContent.includes("Explorer"));
    await click("Adicionar ao carrinho");
    await click("Adicionar ao carrinho");
    assert.equal(
      container.querySelector('[data-testid="cart-count"]')!.textContent,
      "2",
    );
    await click("Voltar às categorias");
    assert.ok(!container.querySelector(".product-card"));
    await click("PLANOS VIPS");
    assert.ok(container.textContent.includes("Explorer"));
    assert.ok(!container.textContent.includes("Farm do teste"));
    assert.ok(
      container.querySelector(".product-price")!.textContent.includes("4,90"),
    );
    assert.ok(
      !container.querySelector(".product-art")!.textContent.includes("30 dias"),
    );
    await click("Adicionar ao carrinho");
    await click("Adicionar ao carrinho");
    assert.equal(
      container.querySelector('[data-testid="cart-count"]')!.textContent,
      "3",
    );
    await click("Voltar às categorias");
    assert.equal(
      container.querySelector('[data-testid="cart-count"]')!.textContent,
      "3",
    );
    const saved = JSON.parse(browser.localStorage.getItem("netcraft-cart-v1")!);
    assert.equal(saved.length, 2);
    assert.equal(saved[0].quantity, 2);
    assert.equal(saved[1].quantity, 1);
    assert.ok(!("price" in saved[0]));
    await act(async () => root.unmount());
    root = createRoot(container as unknown as HTMLElement);
    await act(async () =>
      root.render(
        <CartProvider>
          <TestShop />
        </CartProvider>,
      ),
    );
    assert.equal(
      container.querySelector('[data-testid="cart-count"]')!.textContent,
      "3",
    );
  } finally {
    await act(async () => root.unmount());
    Object.assign(globals, previous);
    await browser.happyDOM.close();
  }
});
