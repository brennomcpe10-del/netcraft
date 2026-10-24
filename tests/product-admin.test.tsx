import { test } from "node:test";
import assert from "node:assert/strict";
import { Product } from "../src/types/index.ts";
import { defaultStoreCategories } from "../src/lib/storeCategories.ts";
import { normalizeProduct, adminProductList } from "../src/lib/productAdmin.ts";
import {
  productCatalog,
  ProductRepository,
} from "../server/services/productCatalog.ts";
import { quoteCart } from "../src/lib/cartQuote.ts";
const product: Product = {
  id: "fixture-a",
  name: "Kit isolado",
  category: "farms",
  price: 7.5,
  description: "Somente fixture do teste",
  image: "/categories/items.webp",
  active: true,
  highlights: ["16 itens de teste"],
  order: 2,
  allowQuantity: true,
  maxQuantity: 3,
};
function memoryRepository(initial: Product[] = []) {
  const data = new Map(initial.map((p) => [p.id, structuredClone(p)]));
  const repository: ProductRepository = {
    get: async (id) => structuredClone(data.get(id) || null),
    categories: async () => defaultStoreCategories,
    create: async (p) => {
      if (data.has(p.id)) throw new Error("ID repetido");
      data.set(p.id, structuredClone(p));
    },
    update: async (p) => {
      if (!data.has(p.id)) throw new Error("Não encontrado");
      data.set(p.id, structuredClone(p));
    },
    remove: async (id) => {
      data.delete(id);
    },
  };
  return { data, repository };
}
test("admin creates products in registered categories and retains descriptions, content and prices", async () => {
  const { data, repository } = memoryRepository();
  const saved = await productCatalog(repository).save({
    ...product,
    rewardDraft: {
      version: 1,
      items: [{ itemId: "minecraft:stone", quantity: 16 }],
    },
  });
  assert.equal(data.size, 1);
  assert.equal(saved.category, "farms");
  assert.equal(saved.price, 7.5);
  assert.deepEqual(saved.highlights, ["16 itens de teste"]);
  assert.equal(saved.rewardDraft?.items[0].quantity, 16);
});
test("admin edits category/order/availability while preserving ID and unknown stored metadata", async () => {
  const original = {
    ...product,
    metadata: { legacy: "preservado" },
  } as Product;
  const { data, repository } = memoryRepository([original]);
  const updated = await productCatalog(repository).save(
    { category: "temporarios", price: 8.9, order: 0, active: false },
    product.id,
  );
  assert.equal(updated.id, product.id);
  assert.equal(updated.category, "temporarios");
  assert.equal(updated.order, 0);
  assert.equal(updated.active, false);
  assert.deepEqual((data.get(product.id) as any).metadata, {
    legacy: "preservado",
  });
  assert.equal(updated.image, product.image);
});
test("deletion targets exact ID and does not delete another product with the same name", async () => {
  const other = { ...product, id: "fixture-b" };
  const { data, repository } = memoryRepository([product, other]);
  await productCatalog(repository).remove(product.id);
  assert.equal(data.size, 1);
  assert.equal(data.get(other.id)?.name, product.name);
});
test("persistence failures reject instead of returning a successful save or deletion", async () => {
  const { repository } = memoryRepository([product]);
  repository.create =
    repository.update =
    repository.remove =
      async () => {
        throw new Error("Falha de armazenamento simulada");
      };
  const service = productCatalog(repository);
  await assert.rejects(
    service.save({ ...product, id: "new" }),
    /Falha de armazenamento/,
  );
  await assert.rejects(
    service.save({ price: 10 }, product.id),
    /Falha de armazenamento/,
  );
  await assert.rejects(service.remove(product.id), /Falha de armazenamento/);
});
test("invalid category, prices, content, quantities and identity changes are rejected before writes", async () => {
  const { data, repository } = memoryRepository([product]);
  const service = productCatalog(repository);
  for (const patch of [
    { category: "nao-cadastrada" },
    { price: NaN },
    { price: -1 },
    { price: 1.999 },
    { price: 0, active: true },
    { maxQuantity: 0 },
    { active: "true" as any },
    { order: 1.5 },
    { id: "another" },
  ])
    await assert.rejects(service.save(patch, product.id));
  assert.equal(data.get(product.id)?.price, 7.5);
  await assert.rejects(
    service.save({ name: "Mudança" }, "missing"),
    /não encontrado/,
  );
});
test("unrecognized client reward/command fields are not persisted and legacy metadata survives", () => {
  const saved = normalizeProduct(
    {
      ...product,
      command: "give @a diamond 64",
      rewards: [{ id: "fake" }],
    } as any,
    defaultStoreCategories,
  );
  assert.ok(!("command" in saved));
  assert.ok(!("rewards" in saved));
});
test("admin ordering/category filter and cart totals use configured product values", () => {
  const second = {
    ...product,
    id: "fixture-b",
    name: "Kit B",
    price: 2.9,
    order: 1,
  };
  assert.deepEqual(
    adminProductList([product, second], "farms", "").map((p) => p.id),
    [second.id, product.id],
  );
  assert.equal(
    adminProductList([product, second], "temporarios", "").length,
    0,
  );
  const quote = quoteCart(
    [
      { productId: product.id, productType: "product", quantity: 3 },
      { productId: second.id, productType: "product", quantity: 2 },
    ],
    [product, second],
  );
  assert.equal(quote.totalCents, 2830);
  assert.throws(() =>
    quoteCart(
      [{ productId: product.id, productType: "product", quantity: 4 }],
      [product],
    ),
  );
});

test("product document identifiers reject unsafe paths and hidden whitespace", async () => {
  const { data, repository } = memoryRepository();
  const service = productCatalog(repository);
  for (const id of [
    "../orders", "folder/kit", " kit", "kit ", "kit\\nother",
    ".", "..", "__proto__.test", "kit?foo=bar", "áudio", "x",
  ]) {
    await assert.rejects(service.save({ ...product, id }), /Identificador de produto inválido/, id);
  }
  assert.equal(data.size, 0);
  const saved = await service.save({ ...product, id: "kit_PVP-001" });
  assert.equal(saved.id, "kit_PVP-001");
});

test("admin rejects malformed product description and highlights before persisting", async () => {
  const { data, repository } = memoryRepository([product]);
  const service = productCatalog(repository);
  for (const patch of [
    { description: 123 },
    { description: false },
    { highlights: "Kit de teste" },
    { highlights: 4 },
  ]) {
    await assert.rejects(service.save(patch as any, product.id));
  }
  assert.deepEqual(data.get(product.id), product);
});

test("admin rejects non-string product names and image values", async () => {
  const { data, repository } = memoryRepository([product]);
  const service = productCatalog(repository);
  for (const patch of [
    { name: 123 }, { name: true }, { name: { toString: () => "Fake" } },
    { image: false }, { image: 77 },
  ]) {
    await assert.rejects(service.save(patch as any, product.id));
  }
  assert.deepEqual(data.get(product.id), product);
});
