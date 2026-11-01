import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {validateVerifiedOutboxResponse} from './verified_outbox_protocol.js';
const require=createRequire(import.meta.url);
const {createVerifiedOutboxServer}=require('./verified_outbox_server.cjs');
process.env.NODE_ENV='test';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8085';
delete process.env.VERCEL_ENV;
delete process.env.MERCADOPAGO_ACCESS_TOKEN;
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const orderId='a'.repeat(64), id=orderId+'-0',player='Local Tester',token='b'.repeat(64);
function certs(dir){
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes',
  '-keyout',path.join(dir,'key.pem'),'-out',path.join(dir,'cert.pem'),'-days','1',
  '-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],
  {stdio:'ignore'});
 return {key:fs.readFileSync(path.join(dir,'key.pem')),
   cert:fs.readFileSync(path.join(dir,'cert.pem'))};
}
function request(server,cert,route,secret,body={},nonce=null,stamp=Date.now()){
 return new Promise((resolve,reject)=>{
  const payload=JSON.stringify(body);
  const req=https.request({hostname:'127.0.0.1',port:server.address().port,path:route,
   method:'POST',ca:cert,minVersion:'TLSv1.2',
   headers:{'Content-Type':'application/json','x-nc-bds-token':secret,
    ...(nonce?{'x-nc-nonce':nonce,'x-nc-timestamp':String(stamp)}:{}),
    'Content-Length':Buffer.byteLength(payload)}},res=>{
   let txt='';res.on('data',b=>txt+=b);res.on('end',()=>{
    try{resolve({status:res.statusCode,body:JSON.parse(txt)});}
    catch(err){reject(err);}
   });
  });
  req.on('error',reject);req.end(payload);
 });
}
const start=async server=>new Promise((resolve,reject)=>{
 server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
});
const close=async server=>new Promise(r=>server.close(r));
const fixture={contract:'netcraft.delivery.v1',id,orderId,gamertag:player,
 kind:'items',items:[{itemId:'minecraft:diamond',quantity:2}]};
test('trusted local Pix outbox HTTPS: BDS protocol, nonce, ACK and restart replay',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ncbr-verified-'));
 try{
  const {key,cert}=certs(dir),issued=new Set(),acked=new Set();
  const bridge={
   offer:async jobId=>{
    if(acked.has(jobId))return {status:'held'};
    issued.add(jobId);return {status:'offered',payload:fixture};
   },
   acknowledge:async jobId=>{
    if(!issued.has(jobId))return {status:'held'};
    acked.add(jobId);return {status:'acknowledged'};
   },
   releaseBeforeGrant:async (jobId,reason,receipt)=>{
    if(!issued.has(jobId)||reason!=='inventory_full'||receipt!=='none')
      return {status:'held'};
    issued.delete(jobId);return {status:'retryable'};
   },
  };
  const config={key,cert,token,gamertag:player,ids:[id],bridge};
  let server=createVerifiedOutboxServer(config);await start(server);
  try{
   assert.equal((await request(server,cert,'/delivery/challenge','c'.repeat(64))).status,401);
   async function challenge(){
    const r=await request(server,cert,'/delivery/challenge',token);
    assert.equal(r.status,200);return r.body.nonce;
   }
   // A syntactically valid ACK must still require an actual durable lease.
   assert.equal((await request(server,cert,'/delivery/ack',token,
     {deliveryId:id,result:'applied'},await challenge())).status,409);
   const n=await challenge();
   assert.equal((await request(server,cert,'/delivery/poll',token,{gamertag:'Other'},n)).status,400);
   assert.equal((await request(server,cert,'/delivery/poll',token,{gamertag:player},n)).status,401);
   const pollNonce=await challenge();
   const poll=await request(server,cert,'/delivery/poll',token,{gamertag:player},pollNonce);
   assert.equal(poll.status,200);
   assert.equal(poll.body.environment,'verified_pix_emulator');
   assert.deepEqual(validateVerifiedOutboxResponse(poll.body,player),[fixture]);
   const rejected=await request(server,cert,'/delivery/nack',token,
     {deliveryId:id,reason:'manual_review',receipt:'started'},await challenge());
   assert.equal(rejected.status,409);
   // Restart the HTTPS gateway mid-offer: safe NACK authorization comes
   // from the injected durable bridge, never its transient process Set.
   await close(server);server=createVerifiedOutboxServer(config);await start(server);
   const full=await request(server,cert,'/delivery/nack',token,
     {deliveryId:id,reason:'inventory_full',receipt:'none'},await challenge());
   assert.equal(full.status,200);assert.equal(full.body.retryable,true);
   const repoll=await request(server,cert,'/delivery/poll',token,
     {gamertag:player},await challenge());
   assert.equal(repoll.body.deliveries.length,1);
   const staleNonce=await challenge();
   await close(server);server=createVerifiedOutboxServer(config);await start(server);
   // Server-issued challenges must not survive a gateway restart.
   assert.equal((await request(server,cert,'/delivery/ack',token,
     {deliveryId:id,result:'applied'},staleNonce)).status,401);
   const ackNonce=await challenge();
   const ack=await request(server,cert,'/delivery/ack',token,{deliveryId:id,result:'applied'},ackNonce);
   assert.equal(ack.status,200);assert.equal(ack.body.acknowledged,true);
   const pollAgain=await request(server,cert,'/delivery/poll',token,{gamertag:player},await challenge());
   assert.deepEqual(pollAgain.body.deliveries,[]);
  }finally{await close(server);}
  server=createVerifiedOutboxServer(config);await start(server);
  try{
   const c=await request(server,cert,'/delivery/challenge',token);
   const r=await request(server,cert,'/delivery/poll',token,{gamertag:player},c.body.nonce);
   assert.deepEqual(r.body.deliveries,[]);
  }finally{await close(server);}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Bedrock rejects fabricated commercial jobs and privilege escalation',()=>{
 const wrap=(entries,env='verified_pix_emulator')=>({
  simulation:true,environment:env,dispatchEnabled:false,deliveries:entries,
 });
 const lab={...fixture,labFixture:true};
 assert.deepEqual(validateVerifiedOutboxResponse(wrap([lab]),player),[fixture]);
 for(const invalid of [
  {...lab,rankTag:'admin'},
  {...lab,items:[{itemId:'minecraft:diamond',quantity:999999}]},
  {...lab,id:'not-an-order'},
  {...lab,gamertag:'Other'},
  {...lab,kind:'vip',rankTag:'admin',days:30},
  {...lab,kind:'vip',rankTag:'ncbr:vip_explorer',days:365},
  {...lab,source:'untrusted'},
 ])assert.equal(validateVerifiedOutboxResponse(wrap([invalid]),player),null);
 assert.equal(validateVerifiedOutboxResponse(wrap([lab],'production'),player),null);
 assert.equal(validateVerifiedOutboxResponse({...wrap([lab]),dispatchEnabled:true},player),null);
});
