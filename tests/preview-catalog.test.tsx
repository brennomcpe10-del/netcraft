import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeCatalogSnapshots, previewCatalogName } from "../server/services/previewCatalog.ts";

test("Preview uses separate product and VIP namespaces", () => {
  assert.equal(previewCatalogName("products"),"previewProducts");
  assert.equal(previewCatalogName("vips"),"previewVips");
});

test("Preview overrides replace matching Production items without altering source arrays", () => {
  const base=[
    {id:"p1",name:"Original",price:9.9},
    {id:"p2",name:"Fixo",price:5},
  ];
  const overrides=[
    {id:"p1",name:"Preço teste",price:1.25},
    {id:"p3",name:"Novo na Preview",price:2.5},
  ];
  const result=mergeCatalogSnapshots(base,overrides);
  assert.deepEqual(result,[
    {id:"p1",name:"Preço teste",price:1.25},
    {id:"p2",name:"Fixo",price:5},
    {id:"p3",name:"Novo na Preview",price:2.5}
  ]);
  assert.equal(base[0].price,9.9);
});

test("Preview tombstones hide original items and allow recreation", () => {
  const base=[{id:"p1",name:"Original",price:9.9}];
  const deleted=mergeCatalogSnapshots(base,[{id:"p1",__previewDeleted:true}]);
  assert.deepEqual(deleted,[]);
  const recreated=mergeCatalogSnapshots(base,[{id:"p1",name:"Recriado",price:3}]);
  assert.deepEqual(recreated,[{id:"p1",name:"Recriado",price:3}]);
});

test("Preview backend storefront, pricing and Pix share the overlay resolver", () => {
  const api=readFileSync(new URL("../server/routes/api.ts",import.meta.url),"utf8");
  const pix=readFileSync(new URL("../server/payments/service.ts",import.meta.url),"utf8");
  const products=readFileSync(new URL("../server/services/firestoreProducts.ts",import.meta.url),"utf8");
  assert.match(api,/listCatalog\('products'\)/);
  assert.match(api,/listCatalog\('vips'\)/);
  assert.match(api,/readStoreCategories\(\)/);
  assert.match(api,/readCatalogItem\(line\.productType===/);
  assert.match(pix,/readCatalogItem\(line\.productType===/);
  assert.match(products,/catalogWriteReference\("products",product\.id\)/);
  assert.match(products,/__previewDeleted:true/);
  for(const col of ["previewProducts","previewVips","previewStoreSettings"]){
    const rules=readFileSync(new URL("../firestore.rules",import.meta.url),"utf8");
    assert.match(rules,new RegExp(`match /${col}/\\{id\\} \\{ allow read, write: if false; \\}`));
  }
});

test("partial Preview edits preserve fields needed by storefront and checkout", () => {
  const baseline = [{ id:"kit", name:"Kit original", price:19.9, active:true, rewardDraft:{ kind:"item" } }];
  const overlays = [{ id:"kit", name:"Kit renomeado" }];
  const result = mergeCatalogSnapshots(baseline, overlays);
  assert.deepEqual(result, [{ ...baseline[0], name:"Kit renomeado" }]);
  assert.deepEqual(baseline, [{ id:"kit", name:"Kit original", price:19.9, active:true, rewardDraft:{ kind:"item" } }]);
  assert.deepEqual(overlays, [{ id:"kit", name:"Kit renomeado" }]);
});

test("partial VIP edits retain base duration and benefits", () => {
  const baseline = [{ id:"vip", name:"VIP", price:10, duration:"30 dias", benefits:["Kit"] }];
  const result = mergeCatalogSnapshots(baseline, [{ id:"vip", price:12 }]);
  assert.deepEqual(result, [{ ...baseline[0], price:12 }]);
});

test("tombstones still hide records even when a base has additional fields", () => {
  const result = mergeCatalogSnapshots([{ id:"kit", price:10, active:true }], [{ id:"kit", __previewDeleted:true }]);
  assert.deepEqual(result, []);
});

test("Preview internal deletion marker is never returned in visible catalog entries", () => {
  const original = [{ id: "p1", name: "Base", price: 9 }];
  const override = [{ id: "p1", price: 7, __previewDeleted: false }];
  const result = mergeCatalogSnapshots(original, override);
  assert.deepEqual(result, [{ id: "p1", name: "Base", price: 7 }]);
  assert.equal(override[0].__previewDeleted, false);
  assert.equal(original[0].price, 9);
});

test("single-item Preview reads strip internal tombstone marker as list reads do", () => {
  const source = readFileSync(new URL("../server/services/previewCatalog.ts", import.meta.url), "utf8");
  const read = source.slice(source.indexOf("export async function readCatalogItem("), source.indexOf("export function listCatalog("));
  assert.match(read, /const \{ __previewDeleted: _internalMarker, \.\.\.visibleOverlay \} = overlay\.data\(\) \|\| \{\}/);
  assert.match(read, /\.\.\.visibleOverlay,id:overlay\.id/);
});
