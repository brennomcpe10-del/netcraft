// OPTIONAL BDS clone-only Pix TEST emulator bridge.
// NEVER import into the ordinary mobile/production addon. Disabled by default.
// Uses no public endpoints, web checkout, payment or production secrets.
import { variables, secrets } from '@minecraft/server-admin';
import { http, HttpRequest, HttpRequestMethod, HttpHeader } from '@minecraft/server-net';
import { validateVerifiedOutboxResponse } from './verified_outbox_protocol.js';

const ORIGIN='https://127.0.0.1:18443';
const FLAG='ncbr_pix_emulator_enabled', TOKEN='ncbr_pix_emulator_token';
const active=new Set();
let started=false;
function enabled(){
 try {return variables.get(FLAG)===true && variables.get('ncbr_e2e_lab_enabled')!==true;}
 catch{return false;}
}
function post(route,body,secret,nonce){
 if(!['/delivery/challenge','/delivery/poll','/delivery/ack'].includes(route))
  throw Error('route_denied');
 const req=new HttpRequest(ORIGIN+route);
 req.method=HttpRequestMethod.Post;req.timeout=5;req.body=JSON.stringify(body);
 req.headers=[new HttpHeader('Content-Type','application/json'),
  new HttpHeader('x-nc-bds-token',secret)];
 if(nonce){
  req.headers.push(new HttpHeader('x-nc-timestamp',String(Date.now())));
  req.headers.push(new HttpHeader('x-nc-nonce',nonce));
 }
 return req;
}
async function challenge(secret){
 const r=await http.request(post('/delivery/challenge',{},secret));
 if(r.status!==200 || typeof r.body!=='string' || r.body.length>512)
  throw Error('challenge_rejected');
 const data=JSON.parse(r.body);
 if(data?.simulation!==true||data?.environment!=='verified_pix_emulator'||
    !/^[a-f0-9]{32}$/.test(data.nonce||''))throw Error('challenge_invalid');
 return data.nonce;
}
const ackable = result => result?.status==='applied'||result?.status==='already_applied';
async function sync(player,secret,engine){
 if(!player?.isValid || active.has(player.name) ||
    !/^[A-Za-z0-9_ ]{1,32}$/.test(player.name))return;
 active.add(player.name);
 try{
  if(!enabled() || !player.isValid)return;
  const nonce=await challenge(secret);
  const r=await http.request(post('/delivery/poll',{gamertag:player.name},secret,nonce));
  if(r.status!==200||typeof r.body!=='string'||r.body.length>8192)
   throw Error('poll_rejected');
  const jobs=validateVerifiedOutboxResponse(JSON.parse(r.body),player.name);
  if(!jobs)throw Error('untrusted_poll');
  for(const job of jobs){
   if(!enabled()||!player.isValid)return;
   const result=engine.execute(job);
   if(!ackable(result)){
    console.warn('[NETCRAFT_PIX_EMULATOR] HOLD_'+String(result?.status||'UNKNOWN').toUpperCase());
    continue;
   }
   const fresh=await challenge(secret);
   const ack=await http.request(post('/delivery/ack',
    {deliveryId:job.id,result:'applied'},secret,fresh));
   if(ack.status!==200 || typeof ack.body!=='string'||ack.body.length>512 ||
      JSON.parse(ack.body)?.acknowledged!==true||
      JSON.parse(ack.body)?.deliveryId!==job.id)
    throw Error('ack_rejected');
   console.warn('[NETCRAFT_PIX_EMULATOR] GRANTED_AND_ACKED');
  }
 }catch {
  console.warn('[NETCRAFT_PIX_EMULATOR] FAIL_CLOSED');
 }finally{active.delete(player.name);}
}
export function startVerifiedPixEmulatorBds({world,system,engine}){
 if(started)return;started=true;
 if(!enabled()){console.warn('[NETCRAFT_PIX_EMULATOR] OFF');return;}
 let token;
 try{token=secrets.get(TOKEN);}catch{}
 if(!token){console.warn('[NETCRAFT_PIX_EMULATOR] SECRET_MISSING');return;}
 console.warn('[NETCRAFT_PIX_EMULATOR] LOOPBACK_ONLY');
 system.runInterval(()=>{
  if(!enabled())return;
  for(const p of world.getAllPlayers())void sync(p,token,engine);
 },200);
}
