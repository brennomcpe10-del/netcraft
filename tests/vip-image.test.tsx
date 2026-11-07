import { test } from "node:test";
import assert from "node:assert/strict";
import { ProductCatalogError } from "../server/services/productCatalog.ts";
import { validateVipImage } from "../server/services/vipImage.ts";

test("VIP images accept placeholders, secure URLs, local assets and supported image data", () => {
  for (const image of [
    "crown",
    "cube",
    "/categories/vips.webp",
    "/uploads/vip.png?revision=2",
    "https://assets.example.org/vip.png",
    "data:image/png;base64,aGVsbG8=",
    "data:image/webp;base64,YWJj",
  ]) assert.equal(validateVipImage(image), image);
  assert.equal(validateVipImage(undefined), "crown");
});

test("VIP image changes reject unsupported or unsafe payloads with HTTP 400", () => {
  for (const image of [
    null,
    123,
    {},
    "",
    "//external.example.org/a.png",
    "/\\external.example.org/a.png",
    "http://example.org/vip.png",
    "https://",
    "https://user:secret@example.org/vip.png",
    "javascript:alert(1)",
    "data:image/svg+xml;base64,YWJj",
    "data:image/png;base64,%",
    "/image\nSet-Cookie: unsafe",
    "x".repeat(850001),
  ]) {
    assert.throws(
      () => validateVipImage(image),
      (error: unknown) => error instanceof ProductCatalogError && error.status === 400,
      String(image).slice(0,40),
    );
  }
});

test("VIP legacy artwork is preserved on unrelated edits, but new unsafe values are rejected", () => {
  const historicalImage = "http://legacy-cdn.example.org/vip.png";
  assert.equal(validateVipImage(historicalImage, historicalImage), historicalImage);
  assert.equal(validateVipImage(undefined, historicalImage), historicalImage);
  assert.equal(validateVipImage("crown", historicalImage), "crown");
  assert.throws(() => validateVipImage("http://new.example.org/vip.png", historicalImage), ProductCatalogError);
  assert.equal(validateVipImage("https://new.example.org/vip.png", historicalImage), "https://new.example.org/vip.png");
});
