import {test} from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {memoryDB,ordersFixture,ORD} from "./fixtures/pixOrders.ts";
import {createCommercialStagingService} from "../server/delivery/commercialStagingService.ts";
import {
  bdsSignature,BdsAuthError,type BdsSignedMessage,
} from "../server/delivery/bdsSignedRequest.ts";

process.env.NODE_ENV="test";
process.env.FIRESTORE_EMULATOR_HOST="127.0.0.1:8085";
delete process.env.VERCEL_ENV;
delete process.env.MERCADOPAGO_ACCESS_TOKEN;
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const id="a".repeat(64), keyId="lab_bds_v1";
const secret="not-a-real-secret-key-for-delivery-lab-123456789";
let nonceCounter=0;
function fixture(){
  const db=memoryDB() as any;
  // Fake adapter transactions are serialized for concurrent unit tests;
  // Firestore Emulator separately checks the real transactional behavior.
  const original=db.runTransaction;
  let tail=Promise.resolve();
  db.runTransaction=(fn:any)=>{
    const prev=tail;let end!:()=>void;
    tail=new Promise<void>(r=>{end=r});
    return prev.then(()=>original(fn)).finally(end);
  };
  let time=Date.parse("2026-11-02T12:00:00Z");
  let resource=ordersFixture(id,"25.00","approved");
  resource.live_mode=true;
  const order={
    id,environment:"commercial",catalogValidated:true,providerOrderId:ORD,
    collector:"42",currency:"BRL",totalCents:2500,gamertag:"Lab Tester",
    state:"pending",lines:[
      {productType:"product",productId:"kit",quantity:1,reward:{
        version:1,items:[{itemId:"minecraft:diamond",quantity:3}]}},
      {productType:"vip",productId:"pix-vip",quantity:1,duration:"30 dias"},
    ],
  };
  db.records.set("pixCommercialOrders/"+id,structuredClone(order));
  const reader:any={
    me:async()=>({id:42,netcraftTestAccount:false}),
    get:async()=>structuredClone(resource),
  };
  const service=createCommercialStagingService(db,reader,{
    keyring:{[keyId]:secret},now:()=>time,
  });
  const setState=(state:string)=>{
    resource=ordersFixture(id,"25.00",state);
    resource.live_mode=true;
  };
  const step=(ms:number)=>{time+=ms};
  function signed(action:BdsSignedMessage["action"],payload:unknown,
    options:{nonce?:string,secret?:string}={}):BdsSignedMessage{
    const body=JSON.stringify(payload);
    const timestamp=String(time);
    const nonce=options.nonce ||
      (++nonceCounter).toString(16).padStart(32,"0");
    return {action,body,headers:{
      timestamp,nonce,keyId,
      signature:bdsSignature(options.secret || secret,{action,body},
        timestamp,nonce,keyId),
    }};
  }
  const jobs=()=>[...db.records.entries()]
    .filter(([path]:[string,unknown])=>path.startsWith("pixCommercialDeliveries/"));
  return {db,order,service,reader,setState,step,signed,jobs};
}
test("15/16: authenticated Orders GET creates immutable queued items/VIP only once; real dispatch is OFF",async()=>{
 const f=fixture();
 assert.deepEqual(await f.service.reconcileAndQueue(id),{
   state:"approved",created:2,dispatchEnabled:false,
 });
 assert.deepEqual(await f.service.reconcileAndQueue(id),{
   state:"approved",created:0,dispatchEnabled:false,
 });
 assert.equal(f.jobs().length,2);
 for(const [,j] of f.jobs()){
   assert.equal(j.state,"queued");
   assert.equal(j.dispatchEnabled,false);
   assert.equal(j.environment,"commercial_candidate");
   assert.match(j.fingerprint,/^[a-f0-9]{64}$/);
 }
 assert.equal(f.jobs()[0][1].payload.kind,"items");
 assert.equal(f.jobs()[1][1].payload.kind,"vip");
 assert.equal(f.jobs()[1][1].payload.rankTag,"ncbr:vip_explorer");
 // A changed server snapshot cannot silently rewrite a previously queued job.
 f.db.records.get("pixCommercialOrders/"+id).lines[0].reward.items[0].quantity=9;
 await assert.rejects(()=>f.service.reconcileAndQueue(id),/delivery_id_conflict/);
 assert.equal(f.jobs().length,2);
});
test("15: pending, rejected and forged provider identities never enqueue candidates",async()=>{
 for(const status of ["pending","rejected","failed","canceled","expired"]){
   const f=fixture();f.setState(status);
   const result=await f.service.reconcileAndQueue(id);
   assert.equal(result.created,0);
   assert.equal(f.jobs().length,0);
 }
 const f=fixture();
 f.reader.me=async()=>({id:999,netcraftTestAccount:false});
 await assert.rejects(()=>f.service.reconcileAndQueue(id),/Recebedor comercial divergente/);
 assert.equal(f.jobs().length,0);
});
test("17/18: signed TLS-only BDS messages use durable nonce, lease, ACK and safe inventory-full retry",async()=>{
 const f=fixture();
 await f.service.reconcileAndQueue(id);
 await assert.rejects(()=>f.service.authenticatedRequest(
   f.signed("poll",{gamertag:"Lab Tester",online:true}),false),/verified_https_required/);
 assert.equal(f.db.records.size,3,"insecure request must not claim a nonce");
 const offline=await f.service.authenticatedRequest(
   f.signed("poll",{gamertag:"Lab Tester",online:false}),true) as any;
 assert.deepEqual(offline.deliveries,[]);
 assert.ok(f.jobs().every(([,j]:any)=>j.state==="queued"));
 const poll=f.signed("poll",{gamertag:"Lab Tester",online:true});
 const offered=await f.service.authenticatedRequest(poll,true) as any;
 assert.equal(offered.deliveries.length,2);
 assert.equal(offered.dispatchEnabled,false);
 await assert.rejects(()=>f.service.authenticatedRequest(poll,true),
   (e:any)=>e instanceof BdsAuthError && e.code==="replayed_request");
 const item=offered.deliveries.find((o:any)=>o.payload.kind==="items");
 const vip=offered.deliveries.find((o:any)=>o.payload.kind==="vip");
 assert.equal(item.payload.items[0].quantity,3);
 const nack=await f.service.authenticatedRequest(f.signed("nack",{
   deliveryId:item.payload.id,leaseToken:item.leaseToken,
   reason:"inventory_full",receipt:"none",
 }),true) as any;
 assert.equal(nack.status,"retryable");
 const tooEarly=await f.service.authenticatedRequest(f.signed("poll",{
   gamertag:"Lab Tester",online:true,
 }),true) as any;
 assert.deepEqual(tooEarly.deliveries,[],"retry backoff and VIP lease hold");
 f.step(5001);
 const retried=await f.service.authenticatedRequest(f.signed("poll",{
   gamertag:"Lab Tester",online:true,
 }),true) as any;
 assert.equal(retried.deliveries.length,1);
 const newItem=retried.deliveries[0];
 assert.equal(newItem.payload.id,item.payload.id);
 assert.notEqual(newItem.leaseToken,item.leaseToken);
 assert.equal((await f.service.authenticatedRequest(f.signed("ack",{
   deliveryId:item.payload.id,leaseToken:item.leaseToken,result:"applied",
 }),true) as any).status,"held","stale lease token cannot ACK a new offer");
 const ack=await f.service.authenticatedRequest(f.signed("ack",{
   deliveryId:newItem.payload.id,leaseToken:newItem.leaseToken,result:"applied",
 }),true) as any;
 assert.equal(ack.status,"acknowledged");assert.equal(ack.duplicate,false);
 const duplicate=await f.service.authenticatedRequest(f.signed("ack",{
   deliveryId:newItem.payload.id,leaseToken:newItem.leaseToken,result:"already_applied",
 }),true) as any;
 assert.equal(duplicate.status,"acknowledged");
 assert.equal(duplicate.duplicate,true);
 const ambiguous=await f.service.authenticatedRequest(f.signed("nack",{
   deliveryId:vip.payload.id,leaseToken:vip.leaseToken,
   reason:"inventory_unavailable",receipt:"started",
 }),true) as any;
 assert.equal(ambiguous.status,"review_required");
 assert.equal(f.jobs()[1][1].state,"review_required");
});
test("17: forged, outdated or malformed signed requests are rejected before side effects",async()=>{
 const f=fixture();
 await f.service.reconcileAndQueue(id);
 const normal=f.signed("poll",{gamertag:"Lab Tester",online:true});
 await assert.rejects(()=>f.service.authenticatedRequest({
   ...normal,headers:{...normal.headers,signature:"0".repeat(64)},
 },true),/unauthorized/);
 const forged=f.signed("poll",{gamertag:"Lab Tester",online:true},
   {secret:"different-hmac-key-not-a-real-secret-123456789"});
 await assert.rejects(()=>f.service.authenticatedRequest(forged,true),/unauthorized/);
 const stale=f.signed("poll",{gamertag:"Lab Tester",online:true});
 stale.headers.timestamp=String(Number(stale.headers.timestamp)-120000);
 await assert.rejects(()=>f.service.authenticatedRequest(stale,true),/invalid_authenticated_request/);
 const invalid=f.signed("ack",{deliveryId:"bad",leaseToken:"bad",result:"applied"});
 await assert.rejects(()=>f.service.authenticatedRequest(invalid,true),/invalid_ack/);
 assert.ok(f.jobs().every(([,j]:any)=>j.state==="queued"));
});
test("18/19: offline, unauthorized NACK, partial-grant errors and refund races never redeliver",async()=>{
 const f=fixture();
 await f.service.reconcileAndQueue(id);
 assert.equal((await f.service.offer(id+"-0","Lab Tester",false)).status,"offline");
 const offer=await f.service.offer(id+"-0","Lab Tester",true) as any;
 assert.equal(offer.status,"offered");
 assert.equal((await f.service.offer(id+"-0","Lab Tester",true)).status,"held");
 assert.equal((await f.service.nack(id+"-0",offer.leaseToken,"unknown_failure","none")).status,
   "review_required");
 assert.equal((await f.service.offer(id+"-0","Lab Tester",true)).status,"held");
 const vip=await f.service.offer(id+"-1","Lab Tester",true) as any;
 f.setState("refunded");
 assert.equal((await f.service.acknowledge(id+"-1",vip.leaseToken,"applied")).status,
   "review_required");
 const refunded=await f.service.reconcileAndQueue(id);
 assert.equal(refunded.state,"refunded");
 assert.ok(f.jobs().every(([,j]:any)=>j.state==="blocked"));
 f.setState("approved");
 const later=await f.service.reconcileAndQueue(id);
 assert.equal(later.state,"refunded");
 assert.ok(f.jobs().every(([,j]:any)=>j.state==="blocked"));
});
test("16: commercial candidate does not activate in Production, Preview or with real credentials",()=>{
 const previous={NODE_ENV:process.env.NODE_ENV,VERCEL_ENV:process.env.VERCEL_ENV,
   FIRESTORE_EMULATOR_HOST:process.env.FIRESTORE_EMULATOR_HOST,
   MERCADOPAGO_ACCESS_TOKEN:process.env.MERCADOPAGO_ACCESS_TOKEN};
 const db=memoryDB() as any;
 const reader:any={me:async()=>({id:42,netcraftTestAccount:false}),
   get:async()=>ordersFixture(id,"25.00","approved")};
 const make=()=>createCommercialStagingService(db,reader,{keyring:{[keyId]:secret}});
 try{
   process.env.NODE_ENV="production";
   assert.throws(make,/commercial_delivery_release_blocked/);
   process.env.NODE_ENV="test";
   process.env.VERCEL_ENV="preview";
   assert.throws(make,/commercial_delivery_release_blocked/);
   delete process.env.VERCEL_ENV;
   process.env.MERCADOPAGO_ACCESS_TOKEN="forbidden-in-lab";
   assert.throws(make,/commercial_delivery_release_blocked/);
 }finally{
  for(const [name,val] of Object.entries(previous)){
    if(val===undefined)delete process.env[name];
    else process.env[name]=val;
  }
 }
});
