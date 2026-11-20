// Entire lifecycle is local/mocked. This suite NEVER uses live Mercado Pago
// credentials, sends Minecraft commands, or enables commercial checkout.
import {test} from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {pixService} from "../server/payments/service.ts";
import {providerKey} from "../server/payments/ordersContract.ts";
import {ordersFixture,memoryDB,ORD,PAY} from "./fixtures/pixOrders.ts";

const input={
 lines:[{productId:"kit",productType:"product",quantity:1}],
 gamertag:"Offline Tester",email:"offline@example.test",cpf:"12345678909",
};
function database(){
 const db=memoryDB() as any;
 db.records.set("products/kit",{name:"Isolated kit",price:25,active:true});
 // Serialize memory transactions as the real Firestore emulator does; the
 // separate emulator integration verifies the database's actual atomicity.
 const original=db.runTransaction;
 let tail=Promise.resolve();
 db.runTransaction=(fn:any)=>{
  const predecessor=tail;
  let release!:()=>void;
  tail=new Promise<void>(resolve=>{release=resolve});
  return predecessor.then(()=>original(fn)).finally(()=>release());
 };
 return db;
}
const localId=(key:string)=>crypto.createHash("sha256").update(key).digest("hex");
const rewards=(db:any)=>[...db.records.entries()]
 .filter(([key]:[string,unknown])=>key.startsWith("pixTestDeliveries/"));

test("13: concurrent same-key checkout reserves one order and sends only one POST",async()=>{
 const db=database(),key="netcraft-concurrent-checkout-idempotent-001";
 let calls=0,release!:()=>void,entered!:()=>void;
 const waiting=new Promise<void>(resolve=>{release=resolve});
 const created=new Promise<void>(resolve=>{entered=resolve});
 let resource:any;
 const gateway:any={
  me:async()=>({id:42,netcraftTestAccount:true}),
  create:async(body:any,k:string)=>{
   calls++;
   assert.equal(k,providerKey(localId(key)));
   entered();
   await waiting;
   resource=ordersFixture(body.external_reference,body.total_amount);
   return structuredClone(resource);
  },
  get:async()=>structuredClone(resource),
 };
 const api=pixService(db,gateway);
 const inFlight=api.create(input,key);
 await created;
 const duplicates=await Promise.all([
  api.create(input,key),api.create(input,key),api.create(input,key),
 ]);
 assert.equal(calls,1);
 assert.ok(duplicates.every((o:any)=>o.id===localId(key)&&o.state==="creating"));
 assert.equal(db.records.get("pixTestOrders/"+localId(key)).creationLease!==null,true);
 release();
 const result=await inFlight;
 assert.equal(result.state,"pending");
 await Promise.all([api.create(input,key),api.create(input,key)]);
 assert.equal(calls,1);
 assert.equal(db.records.get("pixTestProviderOrderBindings/"+ORD).orderId,localId(key));
 assert.equal(db.records.get("pixTestProviderPaymentBindings/"+PAY).orderId,localId(key));
 assert.equal(rewards(db).length,0,"unpaid orders never create reward jobs");
 resource=ordersFixture(localId(key),"25.00","approved");
 await Promise.all(Array.from({length:8},()=>api.reconcile(localId(key))));
 assert.equal(rewards(db).length,1);
 assert.equal(rewards(db)[0][1].dispatchEnabled,false);
 resource=ordersFixture(localId(key),"25.00","refunded");
 await Promise.all([api.reconcile(localId(key)),api.reconcile(localId(key))]);
 assert.equal(rewards(db).length,1);
 assert.equal(rewards(db)[0][1].state,"blocked");
 assert.equal((await api.view(localId(key))).state,"refunded");
 resource=ordersFixture(localId(key),"25.00","approved");
 await api.reconcile(localId(key));
 assert.equal(rewards(db)[0][1].state,"blocked");
 assert.equal((await api.view(localId(key))).state,"refunded");
});
test("14: timeout/crash retry keeps the SAME provider key and never doubles a checkout",async()=>{
 const db=database(),key="netcraft-network-ambiguity-checkout-002",keys:string[]=[];
 let attempts=0,resource:any;
 const gateway:any={
  me:async()=>({id:42,netcraftTestAccount:true}),
  create:async(body:any,k:string)=>{
   attempts++;keys.push(k);
   if(attempts===1)throw Error("simulated lost response");
   resource=ordersFixture(body.external_reference,body.total_amount);
   return structuredClone(resource);
  },
  get:async()=>structuredClone(resource),
 };
 const api=pixService(db,gateway);
 await assert.rejects(()=>api.create(input,key),/lost response/);
 assert.equal((await api.create(input,key)).state,"creating");
 assert.equal(attempts,1,"the lease refuses immediate duplicate network calls");
 const id=localId(key);
 await db.runTransaction(async(tx:any)=>{
  tx.update(db.collection("pixTestOrders").doc(id),{creationLeaseUntil:Date.now()-1000});
 });
 const recovered=await api.create(input,key);
 assert.equal(recovered.state,"pending");
 assert.equal(attempts,2);
 assert.deepEqual(keys,[providerKey(id),providerKey(id)]);
 assert.equal(db.records.get("pixTestProviderOrderBindings/"+ORD).orderId,id);
 assert.equal(rewards(db).length,0);
 await assert.rejects(()=>api.create({...input,gamertag:"Changed Name"},key),/identificador já pertence/);
 assert.equal(attempts,2);
});
test("13: a provider order/payment may not be bound to two different checkout keys",async()=>{
 const db=database();
 let calls=0,resource:any;
 const gateway:any={
  me:async()=>({id:42,netcraftTestAccount:true}),
  create:async(body:any)=>{
   calls++;
   resource=ordersFixture(body.external_reference,body.total_amount);
   return structuredClone(resource);
  },
  get:async()=>structuredClone(resource),
 };
 const api=pixService(db,gateway);
 const a="netcraft-unique-provider-checkout-A-001";
 const b="netcraft-unique-provider-checkout-B-002";
 assert.equal((await api.create(input,a)).state,"pending");
 await assert.rejects(()=>api.create(input,b),/Order já vinculada a outro checkout/);
 assert.equal(calls,2,"provider error must not create a SECOND local paid order");
 assert.equal(db.records.get("pixTestProviderOrderBindings/"+ORD).orderId,localId(a));
 assert.equal(db.records.get("pixTestProviderPaymentBindings/"+PAY).orderId,localId(a));
 assert.equal(rewards(db).length,0);
});
test("14: rejected/expired/cancelled payment states can never mint grants",async()=>{
 for(const paymentStatus of ["rejected","failed","canceled","expired"]){
  const db=database();
  const key="netcraft-negative-lifecycle-"+paymentStatus+"-test";
  let resource:any;
  const gateway:any={
   me:async()=>({id:42,netcraftTestAccount:true}),
   create:async(body:any)=>{
    resource=ordersFixture(body.external_reference,body.total_amount);
    return structuredClone(resource);
   },
   get:async()=>structuredClone(resource),
  };
  const api=pixService(db,gateway);
  const initial=await api.create(input,key);
  resource=ordersFixture(initial.id,"25.00",paymentStatus);
  await Promise.all([api.reconcile(initial.id),api.reconcile(initial.id)]);
  const state=(await api.view(initial.id)).state;
  assert.equal(state,paymentStatus==="expired"?"expired":"cancelled");
  assert.equal(rewards(db).length,0);
 }
});
