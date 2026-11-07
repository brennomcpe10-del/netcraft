import { test } from "node:test";
import assert from "node:assert/strict";
import { assertVipCategoryExists, validateVipCategoryId } from "../server/services/vipCategoryId.ts";
import { defaultStoreCategories } from "../src/lib/storeCategories.ts";
import { readFileSync } from "node:fs";
import { ProductCatalogError } from "../server/services/productCatalog.ts";

test("new VIP category identifiers follow the store category ID format", () => {
  assert.equal(validateVipCategoryId(undefined), "vips");
  assert.equal(validateVipCategoryId("vips"), "vips");
  assert.equal(validateVipCategoryId("kits_temporarios-2"), "kits_temporarios-2");
  assert.equal(validateVipCategoryId("x"), "x");
  for (const invalid of ["", "VIPS", "../orders", "kits/outros", "vip vip", "áudio", "a".repeat(65), null, 123, {}]) {
    assert.throws(
      () => validateVipCategoryId(invalid),
      (err: unknown) => err instanceof ProductCatalogError && err.status === 400,
      String(invalid),
    );
  }
});

test("legacy VIP category stays editable but cannot be replaced with another invalid ID", () => {
  const legacy = "Planos VIPs (antigo)";
  assert.equal(validateVipCategoryId(legacy, legacy), legacy);
  assert.equal(validateVipCategoryId(undefined, legacy), legacy);
  assert.equal(validateVipCategoryId("vips", legacy), "vips");
  assert.throws(
    () => validateVipCategoryId("../another", legacy),
    (err: unknown) => err instanceof ProductCatalogError && err.status === 400,
  );
});

test("legacy empty category remains unchanged until the administrator selects a valid category", () => {
  assert.equal(validateVipCategoryId("", ""), "");
  assert.equal(validateVipCategoryId("vips", ""), "vips");
  assert.throws(() => validateVipCategoryId("", undefined), ProductCatalogError);
});

test("new and moved VIPs must reference a real store category", () => {
  assert.doesNotThrow(() => assertVipCategoryExists("vips", defaultStoreCategories));
  assert.doesNotThrow(() => assertVipCategoryExists("kits", defaultStoreCategories));
  for (const categoryId of ["inventada", "desativada-na-loja", "outro-id"]) {
    assert.throws(
      () => assertVipCategoryExists(categoryId, defaultStoreCategories),
      (error: unknown) => error instanceof ProductCatalogError && error.status === 400,
      categoryId,
    );
  }
});

test("legacy VIPs with removed categories remain editable without admitting new invalid assignments", () => {
  const historicalId = "vip-categoria-antiga";
  assert.doesNotThrow(() => assertVipCategoryExists(historicalId, defaultStoreCategories, historicalId));
  assert.doesNotThrow(() => assertVipCategoryExists("vips", defaultStoreCategories, historicalId));
  assert.throws(() => assertVipCategoryExists("nova-inexistente", defaultStoreCategories, historicalId), ProductCatalogError);
  assert.throws(() => assertVipCategoryExists(historicalId, defaultStoreCategories), ProductCatalogError);
  assert.doesNotThrow(() => assertVipCategoryExists("vips", defaultStoreCategories, "vips"));
});

test("VIP endpoints verify current category selection before persisting", () => {
  const source = readFileSync(new URL("../server/routes/api.ts", import.meta.url), "utf8");
  assert.match(source, /const current = await readStoreCategories\(\)/);
  assert.match(source, /validateCategories\(current\)/);
  const created = source.slice(source.indexOf("apiRouter.post('/admin/vips'"), source.indexOf("apiRouter.put('/admin/vips/:id'"));
  assert.ok(created.indexOf("assertVipCategoryExists(vip.categoryId") < created.indexOf("tx.set(ref,vip)"));
  const edited = source.slice(source.indexOf("apiRouter.put('/admin/vips/:id'"), source.indexOf("apiRouter.delete('/admin/vips/:id'"));
  assert.ok(edited.indexOf("assertVipCategoryExists(next.categoryId") < edited.indexOf("tx.set(ref,next)"));
  assert.match(edited, /const previousCategoryId=.*'vips'/);
});
