'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const dgram=require('node:dgram');const {createRelay}=require('./phone_udp_relay.cjs');
async function bound(s){await new Promise((yes,no)=>{s.once('error',no);s.bind(0,'127.0.0.1',yes);});return s.address().port;}
function getPacket(s){
 return new Promise((yes,no)=>{const guard=setTimeout(()=>{s.removeListener('message',msg);no(Error('timed out'));},3000);
 function msg(b){clearTimeout(guard);yes(b.toString('utf8'));}s.once('message',msg);});
}
test('LAN relay sends Bedrock UDP to 127.0.0.1 and relays replies per client port',async()=>{
 const server=dgram.createSocket('udp4'), phone1=dgram.createSocket('udp4'),
 phone2=dgram.createSocket('udp4');
 let relay;
 try{
  const port=await bound(server);
  server.on('message',(buffer,source)=>{server.send(Buffer.from('echo:'+buffer.toString()),source.port,source.address);});
  relay=createRelay({host:'127.0.0.1',phone:'127.0.0.1',listenPort:0,targetPort:port});
  const front=await relay.start();
  await bound(phone1);await bound(phone2);
  const received1=getPacket(phone1);
  phone1.send(Buffer.from('client-1'),front,'127.0.0.1');
  assert.equal(await received1,'echo:client-1');
  const received2=getPacket(phone2);
  phone2.send(Buffer.from('client-2'),front,'127.0.0.1');
  assert.equal(await received2,'echo:client-2');
  assert.equal(relay.sessionCount(),2);
 }finally{
  if(relay)await relay.stop();
  for(const s of [server,phone1,phone2])await new Promise(ok=>s.close(ok));
 }
});
test('reject malformed forwarding configurations without listener',()=>{
 for(const bad of [{host:'0.0.0.0',phone:'',listenPort:19144},
  {host:'127.0.0.1',phone:'127.0.0.1',targetPort:-1},
  {host:'::1',phone:'127.0.0.1'}])assert.throws(()=>createRelay(bad));
});
