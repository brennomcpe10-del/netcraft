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

test("category image validation rejects unsafe schemes and invalid paths", () => {
  for (const image of ["javascript:alert(1)", "//another-host/image.png", "http://not-https.example/image.png"]) {
    assert.throws(
      () => validateCategories([{ ...defaultStoreCategories[0], image }]),
      /Use imagem HTTPS ou caminho local/,
      image,
    );
  }
});

test("category admin endpoint distinguishes bad input from storage failures", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../server/routes/api.ts", import.meta.url), "utf8");
  const start = source.indexOf("apiRouter.put('/admin/store-categories'");
  const end = source.indexOf("// Public catalogue", start);
  assert.ok(start >= 0 && end > start);
  const route = source.slice(start, end);
  assert.ok(route.indexOf("validateCategories(req.body?.categories)") < route.indexOf("previewCategoryReference().set"));
  assert.match(route, /catch\s*\{\s*return res\.status\(400\)\.json/);
  assert.match(route, /catch\s*\{\s*return res\.status\(503\)\.json/);
});
