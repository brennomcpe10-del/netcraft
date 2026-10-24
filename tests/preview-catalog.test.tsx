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
