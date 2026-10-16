import React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreView } from "../src/views/StoreView.tsx";
import { VipView } from "../src/views/VipView.tsx";
import { ProductCard } from "../src/components/ProductCard.tsx";
import { VIP, Product } from "../src/types/index.ts";
const vip: VIP = {
  id: "vip-a",
  name: "Explorer",
  price: 4.9,
  duration: "30 dias",
  description: "Descrição cadastrada",
  benefits: ["Benefício original"],
  color: "emerald",
  image: "crown",
  order: 1,
  active: true,
};
const product: Product = {
  id: "prod-a",
  name: "Produto original",
  price: 9.9,
  category: "outros",
  description: "Descrição do produto",
  image: "cube",
  active: true,
  highlights: ["Detalhe original"],
  order: 1,
};
test("catalog preserves configured names and prices and excludes inactive records", () => {
  const html = renderToStaticMarkup(
    <StoreView
      vips={[
        vip,
        { ...vip, id: "inactive-vip", name: "VIP oculto", active: false },
      ]}
      products={[
        product,
        {
          ...product,
          id: "inactive-product",
          name: "Produto oculto",
          active: false,
        },
      ]}
      loading={false}
      onBuyItem={() => {}}
    />,
  );
  for (const text of ["Explorer", "Produto original", "4,90", "9,90"])
    assert.ok(html.includes(text));
  assert.ok(!html.includes("VIP oculto"));
  assert.ok(!html.includes("Produto oculto"));
});
test("product detail retains full benefits and duration without broken symbolic image URL", () => {
  const html = renderToStaticMarkup(
    <ProductCard item={vip} onBuy={() => {}} />,
  );
  for (const text of [
    "30 dias",
    "Descrição cadastrada",
    "Benefício original",
    "<details>",
  ])
    assert.ok(html.includes(text));
  assert.ok(!html.includes('src="crown"'));
});
test("VIP page does not promise automatic delivery before integration", () => {
  const html = renderToStaticMarkup(
    <VipView vips={[vip]} loading={false} onBuyVip={() => {}} />,
  );
  assert.ok(html.includes("pagamento será conferido"));
  assert.ok(!html.includes("automática"));
});
test("catalog loading and empty states do not render purchasable cards", () => {
  for (const loading of [true, false]) {
    const html = renderToStaticMarkup(
      <StoreView
        vips={[]}
        products={[]}
        loading={loading}
        onBuyItem={() => {}}
      />,
    );
    assert.ok(!html.includes("product-card"));
    assert.ok(
      html.includes(loading ? "Carregando catálogo" : "Nenhum item encontrado"),
    );
  }
});
