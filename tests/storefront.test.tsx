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
  const vips = [
    vip,
    { ...vip, id: "inactive-vip", name: "VIP oculto", active: false },
  ];
  const products = [
    product,
    {
      ...product,
      id: "inactive-product",
      name: "Produto oculto",
      active: false,
    },
  ];
  for (const category of ["vips", "outros"]) {
    const html = renderToStaticMarkup(
      <StoreView
        vips={vips}
        products={products}
        initialCategory={category}
        loading={false}
        onBuyItem={() => {}}
      />,
    );
    for (const text of category === "vips"
      ? ["Explorer", "4,90"]
      : ["Produto original", "9,90"])
      assert.ok(html.includes(text));
    assert.ok(!html.includes("VIP oculto"));
    assert.ok(!html.includes("Produto oculto"));
  }
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
        initialCategory="vips"
        vips={[]}
        products={[]}
        loading={loading}
        onBuyItem={() => {}}
      />,
    );
    assert.ok(!html.includes("product-card"));
    assert.ok(
      html.includes(
        loading ? "Carregando catálogo" : "ainda não tem produtos disponíveis",
      ),
    );
  }
});

import { selectCatalog, catalogCategories } from "../src/lib/catalog.ts";
import { validateRewardDraft } from "../src/lib/rewardDraft.ts";
import { RewardEditor } from "../src/components/RewardEditor.tsx";
test("catalog supports packages and VIP-category legacy products", () => {
  const legacy = { ...product, category: "vips" as const };
  assert.equal(selectCatalog([legacy], [vip], "vips").length, 2);
  const pack = { ...product, category: "pacotes" as const };
  assert.equal(selectCatalog([pack], [vip], "pacotes")[0].item.id, product.id);
  assert.ok(catalogCategories.some((c) => c.id === "pacotes"));
});
test("search handles accents, whitespace and description", () => {
  const cosmetic = { ...product, name: "Cosmético especial" };
  assert.equal(selectCatalog([cosmetic], [], "all", "  cosmetico  ").length, 1);
  assert.equal(selectCatalog([cosmetic], [], "all", "descricao").length, 1);
  assert.equal(selectCatalog([cosmetic], [], "kits", "cosmetico").length, 0);
});
test("reward draft validates multiple quantities and rejects command injection or invalid counts", () => {
  assert.doesNotThrow(() =>
    validateRewardDraft({
      version: 1,
      items: [
        { itemId: "minecraft:diamond", quantity: 64 },
        { itemId: "ncbrboss:espada_glacial", quantity: 1 },
      ],
    }),
  );
  for (const quantity of [0, -1, 1.5, 2305, NaN])
    assert.throws(() =>
      validateRewardDraft({
        version: 1,
        items: [{ itemId: "minecraft:diamond", quantity }],
      }),
    );
  assert.throws(() =>
    validateRewardDraft({
      version: 1,
      items: [{ itemId: "minecraft:diamond;op @a", quantity: 1 }],
    }),
  );
  assert.throws(() =>
    validateRewardDraft({ version: 1, items: [], command: "op @a" } as any),
  );
  assert.throws(() =>
    validateRewardDraft({
      version: 1,
      items: [{ itemId: "minecraft:diamond", quantity: 1, command: "op @a" }],
    } as any),
  );
});
test("editor displays real Core identifiers as suggestions and clearly marks delivery inactive", () => {
  const html = renderToStaticMarkup(
    <RewardEditor
      value={{
        version: 1,
        items: [{ itemId: "minecraft:diamond", quantity: 32 }],
      }}
      onChange={() => {}}
    />,
  );
  assert.ok(html.includes("ncbrboss:espada_glacial"));
  assert.ok(html.includes("entrega automática ainda não está ativa"));
  assert.ok(html.includes('value="32"'));
});

import { CategoryGrid } from "../src/components/CategoryGrid.tsx";
import {
  defaultStoreCategories,
  validateCategories,
  visibleCategories,
} from "../src/lib/storeCategories.ts";
import {
  addCartLine,
  sanitizeCart,
  resolveCart,
  cartKey,
} from "../src/lib/cart.ts";
import { quoteCart, validateCartRequest } from "../src/lib/cartQuote.ts";
test("store categories respect optional empty visibility, active state and ordering", () => {
  const categories = [
    { ...defaultStoreCategories[0], order: 2 },
    { ...defaultStoreCategories[1], order: 1 },
    { ...defaultStoreCategories[2], active: false },
  ];
  const kit = { ...product, category: "kits" };
  assert.deepEqual(
    visibleCategories(categories, [kit], [vip]).map((c) => c.id),
    ["kits", "vips"],
  );
  const html = renderToStaticMarkup(
    <CategoryGrid
      categories={defaultStoreCategories.map((c) => ({
        ...c,
        showWhenEmpty: false,
      }))}
      products={[]}
      vips={[vip]}
      onSelect={() => {}}
    />,
  );
  assert.ok(html.includes("PLANOS VIPS"));
  assert.ok(html.includes("/categories/vips.webp"));
  assert.ok(!html.includes("KITS PVP"));
  assert.ok(!html.includes("0 disponíveis"));
  assert.ok(!html.includes("Explorer"));
});
test("custom categories group products and VIPs without rewriting commercial data", () => {
  const custom = {
    id: "pvp-pro",
    title: "KIT PVP PRO",
    description: "Equipe-se",
    image: "/categories/items.webp",
    order: 1,
    active: true,
  };
  validateCategories([custom]);
  assert.equal(
    selectCatalog(
      [{ ...product, category: custom.id }],
      [{ ...vip, categoryId: custom.id }],
      custom.id,
    ).length,
    2,
  );
  assert.throws(() => validateCategories([custom, custom]));
  assert.throws(() =>
    validateCategories([{ ...custom, image: "javascript:alert(1)" }]),
  );
});
test("cart mixes VIPs and items, increments permitted quantities and ignores inactive products", () => {
  let cart = addCartLine([], vip, "vip");
  cart = addCartLine(cart, vip, "vip");
  assert.equal(cart[0].quantity, 1);
  cart = addCartLine(cart, { ...product, maxQuantity: 2 }, "product");
  cart = addCartLine(cart, { ...product, maxQuantity: 2 }, "product");
  cart = addCartLine(cart, { ...product, maxQuantity: 2 }, "product");
  assert.equal(cart.length, 2);
  assert.equal(cart[1].quantity, 2);
  assert.equal(
    addCartLine(cart, { ...product, id: "off", active: false }, "product")
      .length,
    2,
  );
  assert.equal(
    addCartLine([], { ...product, allowQuantity: false }, "product")[0]
      .quantity,
    1,
  );
  assert.notEqual(cartKey(cart[0]), cartKey(cart[1]));
});
test("stored cart roundtrip discards client prices and rejects malformed or duplicate lines", () => {
  const cart = [
    { productId: vip.id, productType: "vip", quantity: 1, price: 0 },
    { productId: product.id, productType: "product", quantity: 2 },
  ];
  const clean = sanitizeCart(JSON.parse(JSON.stringify(cart)));
  assert.equal(clean.length, 2);
  assert.ok(!("price" in clean[0]));
  assert.equal(
    sanitizeCart([cart[0], cart[0], { ...cart[1], quantity: -1 }]).length,
    1,
  );
  assert.equal(
    resolveCart(clean, [{ ...product, active: false }], [vip])[1].available,
    false,
  );
});
test("server quote uses catalog prices in cents and rejects unavailable products, quantity and command injection", () => {
  const lines = [
    { productId: vip.id, productType: "vip" as const, quantity: 1 },
    { productId: product.id, productType: "product" as const, quantity: 3 },
  ];
  const quote = quoteCart(lines, [vip, product]);
  assert.equal(quote.totalCents, 3460);
  assert.equal(quote.discountCents, 0);
  assert.equal(quote.combinedPaymentAvailable, false);
  assert.throws(() => quoteCart(lines, [vip, { ...product, active: false }]));
  assert.throws(() => quoteCart([{ ...lines[0], quantity: 2 }], [vip]));
  assert.throws(() =>
    quoteCart([lines[1]], [{ ...product, allowQuantity: false }]),
  );
  assert.throws(() => validateCartRequest([{ ...lines[0], amount: 0 }]));
  assert.throws(() =>
    validateCartRequest([{ ...lines[0], command: "give @a diamond 64" }]),
  );
  assert.throws(() => validateCartRequest([lines[0], lines[0]]));
});

import { HomeView } from "../src/views/HomeView.tsx";
import { ToastProvider } from "../src/context/ToastContext.tsx";
test("home leads with categories, omits individual unfeatured VIPs, and places connection below catalog", () => {
  const html = renderToStaticMarkup(
    <ToastProvider>
      <HomeView
        setCurrentTab={() => {}}
        settings={null}
        vips={[vip]}
        products={[product]}
        events={[]}
        news={[]}
        socialLinks={[]}
        onBuyItem={() => {}}
      />
    </ToastProvider>,
  );
  assert.ok(
    html.indexOf("CATEGORIAS DA LOJA") <
      html.indexOf("Conecte-se ao NetCraftBR"),
  );
  assert.ok(!html.includes("Explorer"));
  assert.ok(!html.includes("Seu próximo nível"));
  assert.ok(html.includes("netcraftbr.srvmc.com"));
  assert.ok(!html.includes("Produtos em destaque"));
});

test("store entry renders categories only; selected category scopes products and provides a return path", () => {
  const kit = {
    ...product,
    id: "farm-z",
    name: "Farm cadastrada",
    category: "farms",
  };
  const entry = renderToStaticMarkup(
    <StoreView
      vips={[vip]}
      products={[kit]}
      loading={false}
      onBuyItem={() => {}}
    />,
  );
  assert.ok(entry.includes("CATEGORIAS DA LOJA"));
  assert.ok(entry.includes("KITS TEMPORÁRIOS"));
  assert.ok(entry.includes("KITS FARM"));
  assert.ok(!entry.includes("Explorer"));
  assert.ok(!entry.includes("Farm cadastrada"));
  assert.ok(!entry.includes("OUTROS PRODUTOS"));
  const category = renderToStaticMarkup(
    <StoreView
      initialCategory="farms"
      vips={[vip]}
      products={[kit]}
      loading={false}
      onBuyItem={() => {}}
    />,
  );
  assert.ok(category.includes("Farm cadastrada"));
  assert.ok(!category.includes("Explorer"));
  assert.ok(category.includes("Voltar às categorias"));
});
test("VIP identity and price stay outside image area; duration appears only in details", () => {
  const html = renderToStaticMarkup(
    <ProductCard item={vip} onBuy={() => {}} />,
  );
  const imageEnd = html.indexOf('class="product-body"');
  assert.ok(!html.slice(0, imageEnd).includes("30 dias"));
  assert.ok(html.slice(imageEnd).includes("<h3>Explorer</h3>"));
  assert.ok(html.slice(imageEnd).includes("4,90"));
  assert.ok(html.slice(imageEnd).includes("Duração: 30 dias"));
});
