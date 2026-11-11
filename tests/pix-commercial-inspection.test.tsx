import {test} from "node:test";
import assert from "node:assert/strict";
import {inspectCommercialOrder} from "../server/payments/commercialInspection.ts";
import {ordersFixture} from "./fixtures/pixOrders.ts";
const localId="c".repeat(64);
const saved={
 id:localId,providerOrderId:ordersFixture(localId).id,
 collector:"42",totalCents:2500,currency:"BRL" as const,
};
const withResource=(status:string)=>{
 const resource=ordersFixture(localId,"25.00",status);
 resource.live_mode=true;
 return resource;
};
test("read-only commercial candidate inspects provider-verified Pix without ever approving dispatch",async()=>{
 let gets=0;
 const merchant={id:42,netcraftTestAccount:false};
 for(const [providerState,expected] of [
  ["pending","pending"],["approved","approved"],
  ["refunded","refunded"],["rejected","cancelled"],
  ["canceled","cancelled"],["failed","cancelled"],["expired","expired"],
 ]){
  const resource=withResource(providerState);
  const reader={me:async()=>merchant,get:async()=>{gets++;return resource;}};
  const inspection=await inspectCommercialOrder(saved,reader);
  assert.equal(inspection.state,expected,providerState);
  assert.equal(inspection.providerVerified,true);
  assert.equal(inspection.canDispatch,false);
  if(providerState==="approved")assert.equal(inspection.reason,"release_not_authorized");
  if(providerState==="refunded")assert.equal(inspection.reason,"refund_or_chargeback");
 }
 assert.equal(gets,7);
});
test("commercial reconciliation refuses a test account, forged data, wrong amount and unverified Pix",async()=>{
 const real=withResource("approved");
 let fetches=0;
 const reader=(resource:any,account={id:42,netcraftTestAccount:false})=>({
  me:async()=>account,
  get:async()=>{fetches++;return resource;},
 });
 await assert.rejects(()=>inspectCommercialOrder(saved,reader(real,{id:42,netcraftTestAccount:true})),/Recebedor comercial divergente/);
 assert.equal(fetches,0,"do not call provider when merchant mismatch");
 for(const patch of [
  {external_reference:"f".repeat(64)},
  {user_id:"999999"},
  {total_amount:"0.01"},
  {live_mode:false},
  {type:"offline"},
  {transactions:{payments:[{...real.transactions.payments[0],amount:"0.01"}]}},
  {transactions:{payments:[{...real.transactions.payments[0],payment_method:{id:"master",type:"credit_card"}}]}},
  {transactions:{payments:[real.transactions.payments[0],real.transactions.payments[0]]}},
 ]){
  await assert.rejects(()=>inspectCommercialOrder(saved,reader({...real,...patch})));
 }
 assert.equal(fetches,8);
});
