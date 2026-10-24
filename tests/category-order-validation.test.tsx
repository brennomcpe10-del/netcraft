import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultStoreCategories, validateCategories } from "../src/lib/storeCategories.ts";

test("category sorting accepts configured fractional order and sensible bounds", () => {
  assert.doesNotThrow(() => validateCategories(defaultStoreCategories));
  for (const order of [0, 2.5, 1000000]) {
    const category = { ...defaultStoreCategories[0], order };
    assert.doesNotThrow(() => validateCategories([category]));
  }
});

test("category sorting rejects negative, excessive and non-finite order", () => {
  for (const order of [-1, -0.01, 1000001, Number.NaN, Infinity, -Infinity]) {
    const category = { ...defaultStoreCategories[0], order };
    assert.throws(() => validateCategories([category]), /Dados da categoria inválidos/, String(order));
  }
});

test("category validation rejects duplicate and malformed IDs", () => {
  const category = defaultStoreCategories[0];
  assert.throws(() => validateCategories([category, { ...category }]), /Identificador/);
  assert.throws(() => validateCategories([{ ...category, id: "../settings" }]), /Identificador/);
});

test("visible storefront categories retain stable order when priorities tie", async () => {
  const { visibleCategories } = await import("../src/lib/storeCategories.ts");
  const categories = [
    { ...defaultStoreCategories[0], id: "zebra", order: 2 },
    { ...defaultStoreCategories[1], id: "alpha", order: 2 },
  ];
  const original = structuredClone(categories);
  const result = visibleCategories(categories, [], []);
  assert.deepEqual(result.map(c => c.id), ["alpha", "zebra"]);
  assert.deepEqual(categories, original);
});
