/**
 * Firestore Emulator evidence: Preview-only synthetic CLONE VIP delivery.
 * Not connected to Mercado Pago, Production Firebase or a real BDS.
 */
import assert from "node:assert/strict";
import {paymentDatabase} from "../server/payments/database.ts";
import {createPreviewGameLinkLab}
  from "../server/delivery/previewGameLinkLab.ts";
import {createPreviewCloneVipAutoLab}
  from "../server/delivery/previewCloneVipAutoLab.ts";
const required:{
  [key:string]:string;
}={NODE_ENV:"test",FIRESTORE_EMULATOR_HOST:"127.0.0.1:8085",
  GCLOUD_PROJECT:"demo-netcraft-admin-test"};
for(const [k,v] of Object.entries(required))assert.equal(process.env[k],v,k);
for(const k of ["MERCADOPAGO_ACCESS_TOKEN","FIREBASE_SERVICE_ACCOUNT_JSON",
  "NCBR_COMMERCIAL_MP_ACCESS_TOKEN","CLOUDFLARE_API_TOKEN"])
  assert.equal(process.env[k]||"","",k);
assert.equal(process.env.VERCEL_ENV||"","");
const db=paymentDatabase();
const clock=Date.now(),linkToken="P".repeat(64),cloneToken="Q".repeat(64);
const link=createPreviewGameLinkLab({db,token:linkToken,now:()=>clock});
const service=createPreviewCloneVipAutoLab({db,cloneToken,now:()=>clock});
const gamer="Halzin5212",sessionId="clone-verified-session-001";
try{
  const voucher=await link.issue(gamer);
  const challenge=await link.challenge({schema:1},linkToken);
  const confirmed=await link.link({code:voucher.code,
    gamertag:gamer,sessionId:"original-minecraft-session"},{
    token:linkToken,nonce:challenge.nonce,timestamp:challenge.timestamp});
  assert.equal(confirmed.status,"verified_in_game");
  const id=voucher.receiptId;
  const queued=await Promise.all([
    service.queue({receiptId:id,tier:"explorer"}),
    service.queue({receiptId:id,tier:"explorer"}),
  ]);
  assert.ok(queued.every(x=>x.state==="queued_clone"));
  const bds={gamertag:gamer,sessionId};
  const polls=await Promise.all([service.poll(bds),service.poll(bds)]);
  const leases=polls.map(x=>x.offer).filter(Boolean);
  assert.equal(leases.length,1,"must lease only one fake VIP");
  const lease=leases[0];
  assert.equal(lease.receiptId,id);
  assert.equal(lease.payload.rankTag,"ncbr:vip_explorer");
  assert.equal(lease.payload.days,30);
  assert.equal((await service.status(id)).state,"offered_clone");
  const nonce=await service.challenge({schema:1},cloneToken);
  const attempts=await Promise.allSettled([
    service.authenticate(cloneToken,nonce.nonce,nonce.timestamp),
    service.authenticate(cloneToken,nonce.nonce,nonce.timestamp),
  ]);
  assert.equal(attempts.filter(x=>x.status==="fulfilled").length,1);
  const result=await service.ack({receiptId:id,
    leaseToken:lease.leaseToken,...bds,result:"applied"});
  assert.equal(result.status,"acknowledged_clone");
  assert.equal((await service.status(id)).state,"acknowledged_clone");
  const after=await service.poll(bds);
  assert.equal(after.offer,null);
  const stored=await db.collection("previewCloneVipAutoV1Jobs").doc(id).get();
  assert.equal(stored.data()?.paymentsEnabled,false);
  assert.equal(stored.data()?.commercialDispatchEnabled,false);
  const commercial=await db.collection("pixCommercialDeliveries")
    .doc(lease.payload.id).get();
  assert.equal(commercial.exists,false);
  console.log("PASS Preview clone: Firestore atomic one-lease/one-ACK, "+
    "nonce anti-replay and commercial OFF");
} finally{
  await db.terminate();
}
