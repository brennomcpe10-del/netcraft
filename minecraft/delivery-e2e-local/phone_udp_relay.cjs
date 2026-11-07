'use strict';
// NetCraft Delivery E2E LAB - UDP forwarder. Only a single IPv4 phone may
// contact BDS via the loopback; original BDS firewall block rules remain intact.
const dgram = require('node:dgram');
const {isIP}=require('node:net');
function createRelay(opts) {
 const host=opts.host, phone=opts.phone, listenPort=opts.listenPort??19144;
 const targetPort=opts.targetPort??19142;
 if(isIP(host)!==4 || isIP(phone)!==4 || !Number.isInteger(listenPort) ||
    listenPort<0 || listenPort>65535 || !Number.isInteger(targetPort) ||
    targetPort<1 || targetPort>65535) throw new Error('invalid_loopback_relay_config');
 const front=dgram.createSocket('udp4');
 const sessions=new Map();
 let stopped=false;
 let lastReceived=0;
 const TTL_MS=90000;
 front.on('message',(buffer,source)=>{
   if(stopped || source.address!==phone || buffer.length<1 || buffer.length>8192)return;
   const now=Date.now();
   if(now-lastReceived>=1000)lastReceived=now;
   const id=source.address+':'+source.port;
   let session=sessions.get(id);
   if(!session) {
     if(sessions.size>=8)return;
     const back=dgram.createSocket('udp4');
     session={back,at:now};
     sessions.set(id,session);
     back.on('message',(packet,from)=>{
       if(stopped || from.address!=='127.0.0.1' || from.port!==targetPort ||
          packet.length>8192 || Date.now()-session.at>TTL_MS)return;
       front.send(packet,source.port,phone,()=>{});
     });
     back.on('error',()=>{sessions.delete(id);try{back.close();}catch{}});
   }
   session.at=now;
   session.back.send(buffer,targetPort,'127.0.0.1',()=>{});
 });
 const purge=setInterval(()=>{
   for(const [id,session] of sessions){
     if(Date.now()-session.at>TTL_MS){sessions.delete(id);try{session.back.close();}catch{}}
   }
 },10000);
 purge.unref();
 async function start(){
   await new Promise((resolve,reject)=>{
     front.once('error',reject);
     front.bind(listenPort,host,()=>{front.removeListener('error',reject);resolve();});
   });
   return front.address().port;
 }
 async function stop(){
   if(stopped)return;
   stopped=true;clearInterval(purge);
   for(const session of sessions.values()){try{session.back.close();}catch{}}
   sessions.clear();
   await new Promise(resolve=>front.close(()=>resolve()));
 }
 return {start,stop,address:()=>front.address(),sessionCount:()=>sessions.size};
}
if(require.main===module){
 if(process.env.NC_PHONE_LAB_RELAY!=='1' || process.env.NODE_ENV==='production' ||
    process.env.VERCEL_ENV)throw new Error('relay_lab_only');
 const relay=createRelay({host:'192.168.1.9',phone:'192.168.1.2',listenPort:19144,targetPort:19142});
 relay.start().then(()=>{
   console.log('NETCRAFT_PHONE_RELAY_READY 192.168.1.9:19144');
 }).catch(()=>{console.error('NETCRAFT_PHONE_RELAY_FAILED');process.exitCode=1;});
 const shutdown=()=>{void relay.stop().then(()=>process.exit(0));};
 process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
}
module.exports={createRelay};
