import {test} from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {memoryDB,ORD,ordersFixture} from "./fixtures/pixOrders.ts";
import {makeRewardRegistry} from "../server/delivery/verifiedRewardRegistry.ts";
import {createNetCraftCommercialCheckout} from "../server/delivery/commercialCheckoutService.ts";
import {createCommercialOrdersWriter} from "../server/payments/mercadoPagoCommercialWriter.ts";

const TOKEN="APP_USR-"+("X".repeat(50));
const KEY="checkout-key-12345678901234567890";
const VIP="netcraft-explorer-commercial";
const registry=makeRewardRegistry([
  {kind:"vip",productId:VIP,tier:"explorer",
    rankTag:"ncbr:vip_explorer",duration:"30 dias",days:30},
  {kind:"items",productId:"kit-test-commercial",
    items:[{itemId:"minecraft:diamond",quantity:3}]},
]);
const prices=[
  {productId:VIP,productType:"vip" as const,priceCents:490},
  {productId:"kit-test-commercial",productType:"product" as const,priceCents:650},
];
function setup(merchantTest=false){
  const db=memoryDB() as any;
  let authorized=true,posts=0,wrongAmount=false;
  const calls:string[]=[];
  const transport:typeof fetch=async(url,init)=>{
    const path=String(url),method=String(init?.method||"GET");
    calls.push(method+":"+path);
    const id=crypto.createHash("sha256").update("netcraft-commercial-v1:"+KEY).digest("hex");
    if(path.endsWith("/users/me"))
      return new Response(JSON.stringify({id:42,tags:merchantTest?["test_user"]:[]}),{status:200});
    if(method==="POST"&&path.endsWith("/v1/orders")){
      posts++;
      const request=JSON.parse(String(init?.body));
      assert.equal(new Headers(init?.headers).get("x-idempotency-key"),id);
      assert.equal(request.total_amount,"4.90");
      assert.equal(request.transactions.payments[0].payment_method.id,"pix");
      assert.equal(request.processing_mode,"automatic");
      assert.equal(request.external_reference,id);
      return new Response(JSON.stringify({id:ORD,user_id:"42",
        external_reference:id,processing_mode:"automatic",type:"online",
        total_amount:wrongAmount?"1.00":"4.90"}),{status:201});
    }
    if(method==="GET"&&path.endsWith("/v1/orders/"+ORD)){
      const o=ordersFixture(id,"4.90","pending");
      o.transactions.payments[0].payment_method.qr_code="000201testpix";
      o.transactions.payments[0].payment_method.qr_code_base64="AAAA";
      return new Response(JSON.stringify(o),{status:200});
    }
    throw Error("unexpected_mock_provider_call");
  };
  const provider=createCommercialOrdersWriter({
    accessToken:TOKEN,transport,checkoutAuthorized:()=>authorized,
  });
  const service=createNetCraftCommercialCheckout({
    db,provider,registry,approvedPrices:prices,releaseApproved:()=>authorized,
  });
  const body={gamertag:"Halzin5212",email:"buyer@example.com",
    lines:[{productId:VIP,quantity:1}]};
  return {db,body,service,calls,posts:()=>posts,stop:()=>{authorized=false;},
    mismatch:()=>{wrongAmount=true;}};
}
function inProd(fn:()=>Promise<void>){
  const names=["NODE_ENV","VERCEL_ENV","FIRESTORE_EMULATOR_HOST"];
  const env=Object.fromEntries(names.map(n=>[n,process.env[n]]));
  process.env.NODE_ENV="production";
  delete process.env.VERCEL_ENV;
  delete process.env.FIRESTORE_EMULATOR_HOST;
  return fn().finally(()=>{
    for(const n of names){if(env[n]===undefined)delete process.env[n];
      else process.env[n]=env[n];}
  });
}
test("commercial checkout creates ONE Pix Orders POST with approved price and secure QR",async()=>{
  await inProd(async()=>{
    const f=setup();
    const first=await f.service.create(f.body,KEY);
    assert.ok("state" in first);
    if(!("state" in first))throw Error("checkout_state_missing");
    assert.equal(first.totalCents,490);
    assert.equal(first.state,"pending");
    assert.equal(first.qrCode,"000201testpix");
    assert.equal(first.qrCodeBase64,"AAAA");
    assert.equal(f.posts(),1);
    const again=await f.service.create(f.body,KEY);
    assert.deepEqual(again,first);
    assert.equal(f.posts(),1);
    const id=first.id;
    assert.match(id,/^[a-f0-9]{64}$/);
    const stored=f.db.records.get("pixCommercialOrders/"+id);
    assert.equal(stored.catalogValidated,true);
    assert.equal(stored.environment,"commercial");
    assert.equal(stored.providerOrderId,ORD);
    assert.equal(stored.state,"pending");
    assert.equal(stored.dispatchEnabled,false);
    assert.equal([...f.db.records.keys()].filter(x=>x.startsWith("pixCommercialDeliveries/")).length,0);
    const checked=await f.service.viewByCheckoutKey(KEY);
    assert.ok("qrCode" in checked);
    if(!("qrCode" in checked))throw Error("checkout_qr_missing");
    assert.equal(checked.qrCode,"000201testpix");
  });
});
test("checkout blocks changed idempotency key, invalid product, double VIP and coupons",async()=>{
  await inProd(async()=>{
    const f=setup();
    await f.service.create(f.body,KEY);
    await assert.rejects(()=>f.service.create({...f.body,gamertag:"AnotherPlayer"},KEY),
      /commercial_idempotency_conflict/);
    await assert.rejects(()=>f.service.create({...f.body,lines:[{productId:"fake",quantity:1}]},
      KEY+"-other-123456789012"),/unapproved_commercial_product/);
    await assert.rejects(()=>f.service.create({...f.body,lines:[{productId:VIP,quantity:2}]},
      KEY+"-more-123456789012"),/unsupported_commercial_cart/);
    await assert.rejects(()=>f.service.create({...f.body,couponCode:"FAKE"},
      KEY+"-coupon-123456789012"),/invalid_commercial_checkout/);
    assert.equal(f.posts(),1);
  });
});
test("commercial checkout refuses unverified merchant, OFF release and wrong provider amount",async()=>{
  await inProd(async()=>{
    const x=setup(true);
    await assert.rejects(()=>x.service.create(x.body,KEY),/commercial_merchant_not_verified/);
    assert.equal(x.posts(),0);
    const f=setup();
    f.stop();
    await assert.rejects(()=>f.service.create(f.body,KEY),/commercial_checkout_release_blocked/);
    assert.equal(f.posts(),0);
    const wrong=setup();
    wrong.mismatch();
    await assert.rejects(()=>wrong.service.create(wrong.body,KEY),/commercial_provider_create_mismatch/);
    const id=crypto.createHash("sha256").update("netcraft-commercial-v1:"+KEY).digest("hex");
    assert.equal(wrong.db.records.get("pixCommercialOrders/"+id).state,"creating");
  });
});
