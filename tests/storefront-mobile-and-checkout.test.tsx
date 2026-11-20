import React from "react";
import {test} from "node:test";
import assert from "node:assert/strict";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import {safeStoreImage} from "../src/lib/storeImage.ts";
import {ProductCard} from "../src/components/ProductCard.tsx";
import {CategoryGrid} from "../src/components/CategoryGrid.tsx";
import {StoreView} from "../src/views/StoreView.tsx";
import {CartView} from "../src/views/CartView.tsx";
import {CartProvider} from "../src/context/CartContext.tsx";
import {PixCheckout} from "../src/components/PixCheckout.tsx";
import {normalizeProduct,draftProduct} from "../src/lib/productAdmin.ts";
import {defaultStoreCategories} from "../src/lib/storeCategories.ts";
import type {Product,VIP} from "../src/types/index.ts";

const kit:Product={id:"pvp-kit",name:"Kit PVP",category:"kits",price:9.9,
 description:"Pronto para aventuras",image:"/categories/items.webp",
 highlights:["Diamantes"],active:true,order:1,allowQuantity:true,maxQuantity:4};
const vip:VIP={id:"vip-explorer",name:"Explorer",price:4.9,duration:"30 dias",
 description:"Plano oficial",image:"crown",color:"emerald",benefits:["Canais VIP"],
 active:true,order:1};
test("image policy preserves safe uploaded assets and rejects injection/unsafe protocols",()=>{
 const fallback="/categories/items.webp";
 for(const value of [undefined,null,"","cube","crown","javascript:alert(1)",
  "http://example.com/kit.webp","//example.com/kit.webp",
  "/\\evil.net/kit.png","data:image/svg+xml;base64,AAAA",
  "/../admin","/a%2fb.webp","https://example.com/kit.webp\" onerror=\"alert(1)"]){
   assert.equal(safeStoreImage(value,fallback),fallback,String(value));
 }
 for(const valid of ["https://cdn.example.net/shop/kit.webp",
  "/categories/items.webp","data:image/png;base64,AAAA"]){
   assert.equal(safeStoreImage(valid,fallback),valid);
 }
 const html=renderToStaticMarkup(<ProductCard item={{...kit,image:"javascript:evil()"}} onBuy={()=>{}}/>);
 assert.ok(html.includes('src="/categories/items.webp"'));
 assert.ok(!html.includes("javascript:evil()"));
});
test("all public store cards use safe images and retain category and price",()=>{
 const html=renderToStaticMarkup(<StoreView products={[kit]} vips={[vip]}
  loading={false} initialCategory="kits" onBuyItem={()=>{}}/>);
 assert.ok(html.includes("Kit PVP"));
 assert.ok(html.includes("9,90"));
 assert.ok(html.includes("Voltar às categorias"));
 assert.ok(html.includes('src="/categories/items.webp"'));
 const categories=renderToStaticMarkup(<CategoryGrid categories={defaultStoreCategories}
  products={[kit]} vips={[vip]} onSelect={()=>{}}/>);
 assert.ok(categories.includes("PLANOS VIPS"));
});
test("mobile cart renders coupon controls, server-price placeholder and Pix checkout without overflow primitives",()=>{
 const html=renderToStaticMarkup(<CartProvider><CartView products={[kit]} vips={[vip]} onShop={()=>{}}/></CartProvider>);
 assert.ok(html.includes("Carrinho de compras"));
 const widget=renderToStaticMarkup(<PixCheckout lines={[{
  productType:"product",productId:kit.id,quantity:1
 }]} couponCode="PROMO" disabled={false}/>);
 assert.ok(widget.includes("Gamertag Bedrock"));
 assert.ok(!widget.includes("Cupom (opcional)"));
 const standalone=renderToStaticMarkup(<PixCheckout lines={[{
  productType:"product",productId:kit.id,quantity:1
 }]} disabled={false}/>);
 assert.ok(standalone.includes("Cupom (opcional)"));
 const css=readFileSync(new URL("../src/index.css",import.meta.url),"utf8");
 for(const rule of [".cart-layout { grid-template-columns: minmax(0, 1fr); }",
   ".cart-summary { padding: 16px; }",".shop-category-card > img",
   ".product-editor footer { flex-wrap: wrap; }"]){
  assert.ok(css.includes(rule),rule);
 }
});
test("empty product delivery editor does not persist a fake configured reward",()=>{
 const newProduct=draftProduct("kits",[]);
 assert.equal(newProduct.rewardDraft,undefined);
 const normal=normalizeProduct({...kit,rewardDraft:{version:1,items:[]}},
  defaultStoreCategories);
 assert.equal(normal.rewardDraft,undefined);
 const edited=normalizeProduct({...kit,rewardDraft:{version:1,items:[
  {itemId:"minecraft:diamond",quantity:2},
 ]}},defaultStoreCategories);
 assert.equal(edited.rewardDraft?.items[0].quantity,2);
});
