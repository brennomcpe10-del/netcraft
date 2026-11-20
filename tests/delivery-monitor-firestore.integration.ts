// Gate 34: real disposable Firestore Admin SDK alert/outbox persistence.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {paymentDatabase} from "../server/payments/database.ts";
import {createDeliveryQueueMonitor} from "../server/delivery/deliveryQueueMonitor.ts";
assert.equal(process.env.NODE_ENV,"test");
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,"127.0.0.1:8085");
assert.equal(process.env.GCLOUD_PROJECT,"demo-netcraft-admin-test");
assert.equal(process.env.MERCADOPAGO_ACCESS_TOKEN||"","");
assert.equal(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||"","");
const db=paymentDatabase();
const id=crypto.createHash("sha256").update("gate34-real-emulator-alert").digest("hex")+"-0";
const now=Date.parse("2026-11-02T18:10:00Z");
try{
 await db.doc("pixCommercialDeliveries/"+id).set({
  id,orderId:"c".repeat(64),state:"awaiting_receipt",
  dispatchEnabled:false,attempts:1,leaseToken:"synthetic-secret-must-not-leak",
  gamertag:"Hidden Test Player",
  createdAt:new Date(now-5*60_000).toISOString(),
 });
 const monitor=()=>createDeliveryQueueMonitor(db,{now:()=>now});
 const first=await monitor().scan();
 assert.equal(first.created,1);
 assert.equal(first.signals.awaiting_receipt,1);
 const second=await monitor().scan();
 assert.equal(second.created,0);
 assert.equal(second.existing,1);
 const alert=await db.collection("pixCommercialDeliveryAlerts")
  .where("signal","==","awaiting_receipt").get();
 assert.equal(alert.docs.length,1);
 const value=alert.docs[0].data();
 assert.equal(value.event,"delivery_queue_alert_v1");
 assert.equal(value.severity,"critical");
 assert.equal(value.dispatchEnabled,false);
 assert.equal(value.state,"unacknowledged");
 const plain=JSON.stringify(value);
 for(const secret of ["Hidden Test Player","synthetic-secret-must-not-leak",
   "minecraft:diamond","Pix",id])
  assert.equal(plain.includes(secret),false);
 console.log("PASS Gate34 real Firestore: deduplicated private alert, no leaking player or lease data, no external notification");
}finally{
 await db.terminate();
}
