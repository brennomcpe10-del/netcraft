import {test} from "node:test";
import assert from "node:assert/strict";
import {
  netcraftPreviewVipRegistry,
  NETCRAFT_PREVIEW_VIP_APPROVALS,
} from "../server/delivery/netcraftVipPreviewApproval.ts";
import {
  NETCRAFT_VIP_TERMS,
  type CatalogVipForApproval,
} from "../server/delivery/netcraftVipCatalogApproval.ts";
import {mappedDelivery} from "../server/delivery/verifiedRewardRegistry.ts";

const catalog: CatalogVipForApproval[] = NETCRAFT_PREVIEW_VIP_APPROVALS.map(x=>({
  id: x.productId,
  name: NETCRAFT_VIP_TERMS[x.tier].name,
  price: NETCRAFT_VIP_TERMS[x.tier].priceCents / 100,
  duration: NETCRAFT_VIP_TERMS[x.tier].duration,
  active: true,
}));
const orderId = "7".repeat(64);
const line = (productId: string) => ({
  productType: "vip", productId, quantity: 1, duration: "30 dias",
});
const copy = () => catalog.map(x=>({...x}));

test("Owner-provided Preview IDs are mapped exactly once to the proper tier",()=>{
  assert.deepEqual(NETCRAFT_PREVIEW_VIP_APPROVALS.map(x=>[x.tier,x.productId]),[
    ["explorer","vip-1791128040888-vvek"],
    ["elite","vip-1791128072288-kztd"],
    ["supreme","vip-1791128111086-kw5n"],
  ]);
  assert.equal(new Set(NETCRAFT_PREVIEW_VIP_APPROVALS.map(x=>x.productId)).size,3);
});

test("Screenshot-confirmed IDs, prices and durations produce correct VIP delivery contracts",()=>{
  const registry = netcraftPreviewVipRegistry(catalog);
  assert.equal(Object.keys(registry).length,3);
  for(let index=0;index<NETCRAFT_PREVIEW_VIP_APPROVALS.length;index++){
    const {tier,productId} = NETCRAFT_PREVIEW_VIP_APPROVALS[index];
    const delivery = mappedDelivery({
      orderId,index,gamertag:"Netcraft Tester",line:line(productId),registry,
    });
    assert.equal(delivery.contract,"netcraft.delivery.v1");
    assert.equal(delivery.id,orderId+"-"+index);
    assert.equal(delivery.kind,"vip");
    if(delivery.kind!=="vip")throw Error("unexpected_delivery_kind");
    assert.equal(delivery.rankTag,NETCRAFT_VIP_TERMS[tier].rankTag);
    assert.equal(delivery.days,30);
  }
});

test("A missing Preview VIP, unknown ID or duplicate catalog ID blocks the entire registry",()=>{
  assert.throws(()=>netcraftPreviewVipRegistry(catalog.slice(1)),
    /vip_catalog_terms_mismatch/);
  const wrong = copy();
  wrong[0].id = "vip-unknown";
  assert.throws(()=>netcraftPreviewVipRegistry(wrong),
    /vip_catalog_terms_mismatch/);
  assert.throws(()=>netcraftPreviewVipRegistry([...catalog,catalog[0]]),
    /invalid_or_duplicate_vip_catalog_id/);
});

test("Any price drift or inactive/mislabeled plan fails closed",()=>{
  for(const [index,{tier}] of NETCRAFT_PREVIEW_VIP_APPROVALS.entries()){
    const changedPrice=copy();
    changedPrice[index].price=NETCRAFT_VIP_TERMS[tier].priceCents/100+0.01;
    assert.throws(()=>netcraftPreviewVipRegistry(changedPrice),
      /vip_catalog_terms_mismatch/);
    const inactive=copy();
    inactive[index].active=false;
    assert.throws(()=>netcraftPreviewVipRegistry(inactive),
      /vip_catalog_terms_mismatch/);
    const renamed=copy();
    renamed[index].name="Other plan";
    assert.throws(()=>netcraftPreviewVipRegistry(renamed),
      /vip_catalog_terms_mismatch/);
    const duration=copy();
    duration[index].duration="7 dias";
    assert.throws(()=>netcraftPreviewVipRegistry(duration),
      /vip_catalog_terms_mismatch/);
  }
});

test("Unapproved IDs and forged VIP duration/quantity cannot generate any reward",()=>{
  const registry=netcraftPreviewVipRegistry(catalog);
  for(const {productId} of NETCRAFT_PREVIEW_VIP_APPROVALS){
    assert.throws(()=>mappedDelivery({orderId,index:0,gamertag:"Netcraft Tester",
      line:{...line(productId),duration:"365 dias"},registry}),
      /vip_product_or_duration_mismatch/);
    assert.throws(()=>mappedDelivery({orderId,index:0,gamertag:"Netcraft Tester",
      line:{...line(productId),quantity:2},registry}),
      /vip_product_or_duration_mismatch/);
  }
  assert.throws(()=>mappedDelivery({orderId,index:0,gamertag:"Netcraft Tester",
    line:line("vip-not-in-preview"),registry}),/unmapped_store_product/);
});

test("Legacy payment-link and client rank fields never decide the VIP reward",()=>{
  const registry=netcraftPreviewVipRegistry(catalog);
  const approval=NETCRAFT_PREVIEW_VIP_APPROVALS[0];
  const delivery=mappedDelivery({
    orderId,index:0,gamertag:"Netcraft Tester",
    line:{...line(approval.productId),rankTag:"ncbr:vip_supreme",
      paymentLink:"https://example.invalid/claim-paid"},
    registry,
  });
  assert.equal(delivery.kind,"vip");
  if(delivery.kind==="vip")assert.equal(delivery.rankTag,"ncbr:vip_explorer");
});
