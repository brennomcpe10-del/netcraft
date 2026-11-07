// Local-only Pix TEST fixture server for a disposable BDS clone.
// Never uses real Pix credentials and never contacts Mercado Pago.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {paymentDatabase} from '../../server/payments/database.ts';
import {createIsolatedPixOutboxBridge} from '../../server/delivery/isolatedPixOutboxBridge.ts';
import {ordersFixture,ORD,PAY} from '../../tests/fixtures/pixOrders.ts';
import {previewDeliveryPlan} from '../../server/delivery/rewardPlan.ts';
import {draftCoreDelivery} from '../../server/delivery/coreJobContract.ts';
const require=createRequire(import.meta.url);
const {createVerifiedOutboxServer}=require('../delivery-e2e-local/verified_outbox_server.cjs');
if(process.env.NODE_ENV!=='test' ||
   process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8085' ||
   process.env.GCLOUD_PROJECT!=='demo-netcraft-admin-test' ||
   process.env.VERCEL_ENV || process.env.MERCADOPAGO_ACCESS_TOKEN ||
   process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS)
 throw Error('isolated_local_test_emulator_required');
const gamertag=process.env.NCBR_PIX_LAB_PLAYER||'';
const token=process.env.NCBR_PIX_LAB_TOKEN||'';
const tlsKey=process.env.NCBR_PIX_LAB_TLS_KEY||'';
const tlsCert=process.env.NCBR_PIX_LAB_TLS_CERT||'';
if(!/^[A-Za-z0-9_ ]{1,32}$/.test(gamertag)||gamertag.trim()!==gamertag||
   !/^[a-f0-9]{64}$/.test(token)||!tlsKey||!tlsCert)
 throw Error('private_test_player_token_and_tls_required');
const key=fs.readFileSync(tlsKey),cert=fs.readFileSync(tlsCert);
const orderId='a'.repeat(64),id=n=>orderId+'-'+n;
const kit={productType:'product',productId:'lab-kit',quantity:1,
  reward:{version:1,items:[{itemId:'minecraft:diamond',quantity:3},
    {itemId:'minecraft:iron_ingot',quantity:6}]}};
const vip={productType:'vip',productId:'lab-explorer',quantity:1,duration:'30 dias'};
const lines=[kit,vip],db=paymentDatabase();
const order={id:orderId,apiVersion:'orders-v1',environment:'test',state:'approved',
 receiverIsTestAccount:true,collector:'42',currency:'BRL',gamertag,
 providerOrderId:ORD,paymentId:PAY,totalCents:2500,
 expiresAt:new Date(Date.now()+86400000).toISOString(),lines};
const jobs=lines.map((line,i)=>{
 const plan=previewDeliveryPlan(line);
 return {id:id(i),orderId,lineIndex:i,gamertag,environment:'test',
  state:'pending',dispatchEnabled:false,line,previewPlan:plan,
  coreDraft:draftCoreDelivery({deliveryId:id(i),orderId,gamertag,
   orderState:'approved',environment:'test',plan})};
});
await db.runTransaction(async tx=>{
 const r=db.collection('pixTestOrders').doc(orderId);
 const refs=jobs.map(j=>db.collection('pixTestDeliveries').doc(j.id));
 const [present,...existing]=await Promise.all([tx.get(r),...refs.map(ref=>tx.get(ref))]);
 if(present.exists||existing.some(x=>x.exists))throw Error('fixture_already_exists_use_fresh_emulator');
 tx.create(r,order);
 jobs.forEach((j,i)=>tx.create(refs[i],j));
});
const provider={me:async()=>({id:42,netcraftTestAccount:true}),
 get:async()=>ordersFixture(orderId,'25.00','approved')};
const bridge=createIsolatedPixOutboxBridge(db,provider,{vipMappings:{
 'lab-explorer':{rankTag:'ncbr:vip_explorer',duration:'30 dias',days:30}
}});
const httpsServer=createVerifiedOutboxServer({key,cert,token,gamertag,
 ids:[id(0),id(1)],bridge});
httpsServer.listen(18443,'127.0.0.1',()=>{
 console.log('[NCBR_PIX_LAB] LOCAL_HTTPS_READY mock approval only');
});
async function shutdown(){await new Promise(resolve=>httpsServer.close(resolve));await db.terminate();}
process.once('SIGINT',()=>{void shutdown().then(()=>process.exit(0));});
process.once('SIGTERM',()=>{void shutdown().then(()=>process.exit(0));});
