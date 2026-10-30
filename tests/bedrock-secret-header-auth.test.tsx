import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import { once } from "node:events";
import { createDeliverySimulationRouter } from "../server/routes/deliverySimulation.ts";

test("opaque BDS header token only grants simulation poll/ack, with nonce and timestamp controls",async()=>{
  const original=process.env.NODE_ENV;
  process.env.NODE_ENV="test";
  const token="bds-demo-token-external-not-for-production-123456";
  const app=express();
  app.use(express.json());
  app.use("/delivery",createDeliverySimulationRouter({ secret:"another-hmac-test-secret-32-characters-min", bdsToken:token }));
  const server=app.listen(0,"127.0.0.1");await once(server,"listening");
  const root="http://127.0.0.1:"+(server.address() as any).port+"/delivery";
  const call=async(path:string, auth:string,nonce:string,timestamp=Date.now())=>{
    const response=await fetch(root+path,{method:"POST",headers:{"content-type":"application/json",
      "x-nc-bds-token":auth,"x-nc-nonce":nonce,"x-nc-timestamp":String(timestamp)},
      body:JSON.stringify(path==="/poll"?{gamertag:"OfflinePlayer"}:{deliveryId:"a".repeat(64)+"-0"})});
    return response.status;
  };
  try{
    assert.equal(await call("/poll",token,crypto.randomBytes(16).toString("hex")),200);
    const nonce="a".repeat(32);
    assert.equal(await call("/poll",token,nonce),200);
    assert.equal(await call("/poll",token,nonce),401);
    assert.equal(await call("/seed",token,"b".repeat(32)),401);
    assert.equal(await call("/refund",token,"c".repeat(32)),401);
    assert.equal(await call("/poll","wrong","d".repeat(32)),401);
    assert.equal(await call("/poll",token,"e".repeat(32),Date.now()-300000),401);
  }finally{
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    if(original===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=original;
  }
});
