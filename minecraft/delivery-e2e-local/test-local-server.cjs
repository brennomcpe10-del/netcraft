'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createLocalServer}=require('./local_server.cjs');
const TOKEN='a'.repeat(64), WRONG='b'.repeat(64);
const ITEM_ID='d'.repeat(64)+'-0';
async function request(base,cert,route,token,body={},nonce,timestamp=Date.now()){
  const https=require('node:https');
  return new Promise((resolve,reject)=>{
   const buf=JSON.stringify(body);
   const req=https.request(base+route,{method:'POST',ca:cert,
    headers:{'Content-Type':'application/json','x-nc-bds-token':token,
     ...(nonce?{'x-nc-nonce':nonce,'x-nc-timestamp':String(timestamp)}:{}),
     'Content-Length':Buffer.byteLength(buf)}},res=>{
      let str='';res.on('data',c=>str+=c);res.on('end',()=>{
       try{resolve({status:res.statusCode,data:JSON.parse(str)});}catch(e){reject(e);}
      });
    });req.on('error',reject);req.end(buf);
  });
}
function makeCert(dir){execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes',
  '-keyout',path.join(dir,'key.pem'),'-out',path.join(dir,'cert.pem'),'-days','1',
  '-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],
  {stdio:'ignore'});return {key:fs.readFileSync(path.join(dir,'key.pem')),
    cert:fs.readFileSync(path.join(dir,'cert.pem'))};}
async function listen(s){await new Promise(r=>s.listen(0,'127.0.0.1',r));return 'https://127.0.0.1:'+s.address().port;}
async function close(s){await new Promise((resolve,reject)=>s.close(e=>e?reject(e):resolve()));}
test('Real localhost TLS fixture: authentication, nonce, offline hold, grant ACK, replay and restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ncbr-e2e-'));
 try{
  const {key,cert}=makeCert(dir);const receiptPath=path.join(dir,'receipts.json');
  const params={key,cert,token:TOKEN,gamertag:'Lab Tester',kind:'items',receiptPath};
  let srv=createLocalServer(params);let base=await listen(srv);
  try{
   assert.equal((await request(base,cert,'/delivery/challenge',WRONG)).status,401);
   assert.equal((await request(base,cert,'/delivery/ack',TOKEN,{deliveryId:ITEM_ID,result:'applied'},'e'.repeat(32))).status,401);
   const {data:issued}=await request(base,cert,'/delivery/challenge',TOKEN);
   assert.match(issued.nonce,/^[a-f0-9]{32}$/);
   assert.equal((await request(base,cert,'/delivery/poll',TOKEN,{gamertag:'Other'},issued.nonce)).status,400);
   const {data:second}=await request(base,cert,'/delivery/challenge',TOKEN);
   let first=await request(base,cert,'/delivery/poll',TOKEN,{gamertag:'Lab Tester'},second.nonce);
   assert.equal(first.status,200);assert.equal(first.data.simulation,true);
   assert.equal(first.data.environment,'synthetic_local');assert.equal(first.data.dispatchEnabled,false);
   assert.equal(first.data.deliveries.length,1);
   assert.deepEqual(first.data.deliveries[0].items,[{itemId:'minecraft:iron_ingot',quantity:2}]);
   assert.equal((await request(base,cert,'/delivery/poll',TOKEN,{gamertag:'Lab Tester'},second.nonce)).status,401);
   assert.equal((await request(base,cert,'/delivery/poll',TOKEN,{gamertag:'Lab Tester'},'e'.repeat(32),Date.now()-130000)).status,401);
   const {data:ackNonce}=await request(base,cert,'/delivery/challenge',TOKEN);
   const ack=await request(base,cert,'/delivery/ack',TOKEN,{deliveryId:ITEM_ID,result:'applied'},ackNonce.nonce);
   assert.equal(ack.status,200);assert.equal(ack.data.acknowledged,true);
   assert.equal(JSON.parse(fs.readFileSync(receiptPath,'utf8'))[ITEM_ID].acknowledged,true);
   const {data:nextNonce}=await request(base,cert,'/delivery/challenge',TOKEN);
   assert.deepEqual((await request(base,cert,'/delivery/poll',TOKEN,{gamertag:'Lab Tester'},nextNonce.nonce)).data.deliveries,[]);
  }finally{await close(srv);}
  srv=createLocalServer(params);base=await listen(srv);
  try{const {data:nonce}=await request(base,cert,'/delivery/challenge',TOKEN);
   const poll=await request(base,cert,'/delivery/poll',TOKEN,{gamertag:'Lab Tester'},nonce.nonce);
   assert.deepEqual(poll.data.deliveries,[]);
  }finally{await close(srv);}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
