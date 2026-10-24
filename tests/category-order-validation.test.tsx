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
