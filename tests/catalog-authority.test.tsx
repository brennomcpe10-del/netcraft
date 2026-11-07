import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (name: string) =>
  readFileSync(new URL(name, import.meta.url), "utf8");

test("public storefront always loads authoritative server prices, not mutable browser snapshots", () => {
  const app = source("../src/App.tsx");
  assert.match(app, /readJson\("\/api\/storefront\/catalog"\)/);
  assert.doesNotMatch(app, /subscribeToVips|subscribeToProducts|getVipsFromFirestore|getProductsFromFirestore|seedFirestoreIfEmpty/);
  assert.match(app, /Catálogo temporariamente indisponível/);
  const categories = source("../src/hooks/useStoreCategories.ts");
  assert.match(categories, /fetch\("\/api\/storefront\/catalog"/);
  assert.doesNotMatch(categories, /onSnapshot|firebase\/firestore/);
});

test("public news page is navigable and rendered", () => {
  const header = source("../src/components/Header.tsx");
  const app = source("../src/App.tsx");
  assert.match(header, /\["news", "Notícias"\]/);
  assert.match(app, /currentTab === "news"/);
  assert.match(app, /<NewsView news=\{news\}/);
});

test("admin listings call authenticated backend for inactive catalog and unpublished content", () => {
  const admin = source("../src/views/AdminView.tsx");
  assert.match(admin, /api\.getVips\(true, adminToken\)/);
  assert.match(admin, /api\.getProducts\(true, undefined, adminToken\)/);
  assert.match(admin, /api\.getEvents\(true, adminToken\)/);
  assert.match(admin, /api\.getNews\(true, adminToken\)/);
  assert.match(admin, /api\.getCommunity\(true, adminToken\)/);
  assert.match(admin, /api\.getSettings\(\)/);
});
