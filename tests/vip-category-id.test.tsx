import { test } from "node:test";
import assert from "node:assert/strict";
import { validateVipCategoryId } from "../server/services/vipCategoryId.ts";
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
