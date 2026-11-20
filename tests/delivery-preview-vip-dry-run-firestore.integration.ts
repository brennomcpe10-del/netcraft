/**
 * Real Firestore Emulator concurrency test. Never points to a real Firebase
 * project, never calls Mercado Pago or BDS, and never grants a Minecraft VIP.
 */
import assert from "node:assert/strict";
import {paymentDatabase} from "../server/payments/database.ts";
import {createPreviewGameLinkLab}
  from "../server/delivery/previewGameLinkLab.ts";
import {createPreviewVipDryRunLab}
  from "../server/delivery/previewVipDryRunLab.ts";
import {NETCRAFT_VIP_TERMS}
  from "../server/delivery/netcraftVipCatalogApproval.ts";
const check={
  NODE_ENV:"test",FIRESTORE_EMULATOR_HOST:"127.0.0.1:8085",
  GCLOUD_PROJECT:"demo-netcraft-admin-test",
};
for(const [key,value] of Object.entries(check))assert.equal(process.env[key],value);
for(const key of ["MERCADOPAGO_ACCESS_TOKEN","FIREBASE_SERVICE_ACCOUNT_JSON",
  "NCBR_COMMERCIAL_MP_ACCESS_TOKEN","NCBR_COMMERCIAL_BDS_TOKEN"]){
  assert.equal(process.env[key]||"","",key);
}
assert.equal(process.env.VERCEL_ENV||"","");
const db=paymentDatabase();
const TOKEN="X".repeat(64),start=Date.now();
try{
  const pairing=createPreviewGameLinkLab({db,token:TOKEN,now:()=>start});
  const lab=createPreviewVipDryRunLab(db,{now:()=>start});
  const voucher=await pairing.issue("Halzin5212");
  const challenge=await pairing.challenge({schema:1},TOKEN);
  const linked=await pairing.link({code:voucher.code,gamertag:"Halzin5212",
    sessionId:"test-entity-player"},{
    token:TOKEN,nonce:challenge.nonce,timestamp:challenge.timestamp,
  });
  assert.equal(linked.status,"verified_in_game");
  const input={receiptId:voucher.receiptId,tier:"explorer" as const};
  const attempts=await Promise.all([lab.simulate(input),lab.simulate(input)]);
  assert.deepEqual(attempts.map(a=>a.status).sort(),[
    "already_simulated","simulated_only",
  ]);
  const [first,second]=attempts;
  assert.equal(first.gamertag,"Halzin5212");
  assert.equal(second.gamertag,"Halzin5212");
  assert.equal(first.startsAt,second.startsAt);
  assert.equal(first.endsAt,second.endsAt);
  assert.equal(first.rankTag,NETCRAFT_VIP_TERMS.explorer.rankTag);
  assert.equal(first.endsAt-first.startsAt,30*24*60*60*1000);
  assert.equal(first.liveVipGranted,false);
  assert.equal(first.dispatchEnabled,false);
  assert.equal(first.grantsEnabled,false);
  await assert.rejects(()=>lab.simulate({
    receiptId:voucher.receiptId,tier:"supreme",
  }),/simulation_already_exists/);
  const fake=await db.collection("previewDeliveryVipDryRunV1")
    .doc(voucher.receiptId).get();
  assert.ok(fake.exists);
  assert.equal(fake.data()?.simulation,true);
  assert.equal(fake.data()?.grantsEnabled,false);
  assert.equal(fake.data()?.gamertag,"Halzin5212");
  assert.equal((await db.collection("pixCommercialOrders")
    .doc(first.simulatedOrderId).get()).exists,false);
  assert.equal((await db.collection("pixCommercialDeliveries")
    .doc(first.simulatedOrderId+"-0").get()).exists,false);
  // The dry run is a record of an expected VIP, not a game grant.
  console.log("PASS: Firestore Emulator concurrent dry-run one record; "+
    "exact 30d mock Explorer, no payment, no commercial queue, no VIP grant");
} finally {
  await db.terminate();
}
