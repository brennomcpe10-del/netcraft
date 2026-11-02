import {test} from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {once} from "node:events";
import crypto from "node:crypto";
import {createPixRouter} from "../server/routes/pix.ts";
import {commercialReadiness,commercialOrderCandidate,
 requiredCommercialGates} from "../server/payments/commercialBoundary.ts";
import {claimWebhook,completeWebhook,releaseWebhook} from "../server/payments/webhookReplay.ts";
import {memoryDB,ORD} from "./fixtures/pixOrders.ts";
import {webhookSignature} from "../server/payments/mercadoPago.ts";
const token=(rid:string,secret="lab-test-only",ts=String(Date.now()))=>{
 const signature=crypto.createHmac("sha256",secret)
  .update(`id:${ORD.toLowerCase()};request-id:${rid};ts:${ts};`).digest("hex");
 return {ts,signature:`ts=${ts},v1=${signature}`};
};
test("commercial checkout and webhook cannot charge even when env flags are set",async()=>{
 const previous=process.env.NCBR_COMMERCE_ENABLED;
 process.env.NCBR_COMMERCE_ENABLED="true";
 let actualCalls=0;
 const dependencies:any={
  assertEnvironment:()=>{actualCalls++;throw Error("test gateway must never run");},
  gateway:()=>{actualCalls++;throw Error("no gateway");},
  database:()=>{actualCalls++;throw Error("no DB");},
  webhookSecret:()=>{actualCalls++;throw Error("no webhook secret");},
 };
 const app=express();app.use(express.json());app.use(createPixRouter(dependencies));
 const server=app.listen(0,"127.0.0.1");
 await once(server,"listening");
 try{
  const url="http://127.0.0.1:"+(server.address() as any).port;
  const config=await fetch(url+"/pix/commercial/config");
  assert.equal(config.status,503);
  const result=await config.json();
  assert.equal(result.commercialCheckoutAvailable,false);
  assert.equal(result.minecraftDispatchEnabled,false);
  assert.equal(result.usesTestCollections,false);
  assert.equal(result.missingGates.length,requiredCommercialGates.length);
  for(const endpoint of ["/pix/commercial/orders","/pix/commercial/webhook"]){
   const response=await fetch(url+endpoint,{method:"POST",headers:{
    "content-type":"application/json"},body:JSON.stringify({amount:1})});
   assert.equal(response.status,503);
  }
  assert.equal(actualCalls,0);
  assert.throws(()=>commercialOrderCandidate({amount:1}),/Checkout comercial bloqueado/);
 }finally{
  if(previous===undefined)delete process.env.NCBR_COMMERCE_ENABLED;
  else process.env.NCBR_COMMERCE_ENABLED=previous;
  server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});
test("Durable notification claims reject replay, concurrent repeat and support retry after failure",async()=>{
 const db=memoryDB() as any;
 const sig=token("evt-1").signature;
 const first=await claimWebhook(db,ORD,"evt-1",sig);
 assert.equal(first.status,"acquired");
 const inFlight=await claimWebhook(db,ORD,"evt-1",sig);
 assert.equal(inFlight.status,"busy");
 await completeWebhook(db,first);
 assert.equal((await claimWebhook(db,ORD,"evt-1",sig)).status,"duplicate");
 assert.equal((await claimWebhook(db,ORD,"evt-1",sig.replace(",v1=",", v1="))).status,"duplicate",
  "whitespace cannot bypass the canonical notification key");
 const secondSignature=token("evt-2").signature;
 const second=await claimWebhook(db,ORD,"evt-2",secondSignature);
 assert.equal(second.status,"acquired");
 await releaseWebhook(db,second);
 assert.equal((await claimWebhook(db,ORD,"evt-2",secondSignature)).status,"acquired");
 const staleAt=Date.now()-100000;
 const staleSig=token("evt-3").signature;
 const stale=await claimWebhook(db,ORD,"evt-3",staleSig,staleAt);
 assert.equal(stale.status,"acquired");
 assert.equal((await claimWebhook(db,ORD,"evt-3",staleSig)).status,"acquired");
 await assert.rejects(()=>claimWebhook(db,"bad","evt","x"),/webhook_replay_input_invalid/);
});
test("HMAC verifies the exact signed order and request ID before replay reservations",()=>{
 const signature=token("good").signature;
 assert.equal(webhookSignature(ORD,"good",signature,"lab-test-only"),true);
 assert.equal(webhookSignature(ORD,"bad",signature,"lab-test-only"),false);
 assert.equal(webhookSignature(ORD,"good",signature,"wrong"),false);
 assert.equal(webhookSignature(ORD,"good",signature+",v1="+signature.split("v1=")[1],"lab-test-only"),false,
   "duplicate HMAC fields are invalid");
 assert.equal(webhookSignature(ORD,"good",signature+",ts="+Date.now(),"lab-test-only"),false);
});
