'use strict';
// Off-by-default LOCAL LAB adapter: verified Firestore TEST outbox -> BDS via
// authenticated TLS loopback. It never reads production Firestore or provider
// credentials; the caller injects an emulator-only, provider-reverified bridge.
const https=require('node:https');
const crypto=require('node:crypto');
const VALID_ID=/^[a-f0-9]{64}-\d{1,3}$/;
const VALID_PLAYER=/^[A-Za-z0-9_ ]{1,32}$/;
function createVerifiedOutboxServer({key,cert,pfx,passphrase,token,gamertag,ids,bridge}) {
 if (process.env.NODE_ENV!=='test' ||
     process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8085' ||
     process.env.VERCEL_ENV || process.env.MERCADOPAGO_ACCESS_TOKEN ||
     process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
   throw Error('verified_test_emulator_only');
 if(!/^[a-f0-9]{64}$/.test(token||'') || !VALID_PLAYER.test(gamertag||'') ||
    gamertag.trim()!==gamertag || !Array.isArray(ids) ||
    ids.length<1 || ids.length>4 ||
    ids.some(id=>!VALID_ID.test(id)) || new Set(ids).size!==ids.length ||
    !bridge || typeof bridge.offer!=='function' ||
    typeof bridge.acknowledge!=='function' ||
    typeof bridge.releaseBeforeGrant!=='function')
   throw Error('invalid_verified_outbox_config');
 // The verified Firestore lease is the authority for ACK/NACK, not process
 // memory: an in-flight Core receipt must remain acknowledgeable after restart.
 const issued=new Map(), used=new Map();
 const respond=(res,status,data)=>{
  res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});
  res.end(JSON.stringify(data));
 };
 return https.createServer({...pfx?{pfx,passphrase}:{key,cert},minVersion:'TLSv1.2'},async(req,res)=>{
  try {
   if(!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))
     return respond(res,403,{error:'loopback_only'});
   if(req.method!=='POST'|| !['/delivery/challenge','/delivery/preflight','/delivery/poll','/delivery/nack','/delivery/ack'].includes(req.url))
     return respond(res,404,{error:'route_denied'});
   if(!String(req.headers['content-type']||'').startsWith('application/json'))
     return respond(res,415,{error:'content_type'});
   const provided=Buffer.from(String(req.headers['x-nc-bds-token']||''));
   const expected=Buffer.from(token);
   if(provided.length!==expected.length||!crypto.timingSafeEqual(provided,expected))
     return respond(res,401,{error:'unauthorized'});
   let bytes=0;const chunks=[];
   for await(const chunk of req) {
    bytes+=chunk.length;
    if(bytes>2048)return respond(res,413,{error:'too_large'});
    chunks.push(chunk);
   }
   let body;
   try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
   catch{return respond(res,400,{error:'invalid_json'});}
   if(!body||typeof body!=='object'||Array.isArray(body))
     return respond(res,400,{error:'invalid_body'});
   const now=Date.now();
   if(req.url==='/delivery/challenge'){
    if(Object.keys(body).length!==0)return respond(res,400,{error:'bad_challenge'});
    for(const [n,t] of issued)if(now-t>60000)issued.delete(n);
    for(const [n,t] of used)if(now-t>120000)used.delete(n);
    // Bound outstanding challenges even if a lab credential is misused.
    if(issued.size>=128)return respond(res,429,{error:'challenge_capacity'});
    const nonce=crypto.randomBytes(16).toString('hex');
    issued.set(nonce,now);
    return respond(res,200,{simulation:true,environment:'verified_pix_emulator',nonce});
   }
   const nonce=String(req.headers['x-nc-nonce']||'');
   const timestamp=String(req.headers['x-nc-timestamp']||'');
   if(!/^[a-f0-9]{32}$/.test(nonce)||!/^[0-9]{13}$/.test(timestamp)||
      Math.abs(now-Number(timestamp))>60000||used.has(nonce)||
      !issued.has(nonce)||now-issued.get(nonce)>60000)
     return respond(res,401,{error:'nonce_invalid'});
   issued.delete(nonce);used.set(nonce,now);
   // Read-only lab probe: NEVER calls bridge.offer, allocates leases, or ACKs.
   // A real BDS can verify opaque SecretString + HTTPS without holding a grant.
   if(req.url==='/delivery/preflight'){
    if(Object.keys(body).length!==1||body.gamertag!==gamertag)
      return respond(res,400,{error:'wrong_player'});
    return respond(res,200,{simulation:true,environment:'verified_pix_emulator',
      dispatchEnabled:false,grantsEnabled:false,ackEnabled:false,ready:true});
   }
   if(req.url==='/delivery/poll'){
    if(Object.keys(body).length!==1||body.gamertag!==gamertag)
     return respond(res,400,{error:'wrong_player'});
    const deliveries=[];
    for(const id of ids){
     if(deliveries.length>=4)break;
     const next=await bridge.offer(id,true);
     if(next.status!=='offered')continue;
     if(next.payload?.gamertag!==gamertag ||
        next.payload?.id!==id || next.payload?.orderId!==id.split('-')[0])
       throw Error('untrusted_payload');
     deliveries.push({...next.payload,labFixture:true});
    }
    return respond(res,200,{simulation:true,environment:'verified_pix_emulator',
      dispatchEnabled:false,deliveries});
   }
   if(req.url==='/delivery/nack'){
    if(Object.keys(body).length!==3||!VALID_ID.test(body.deliveryId)||
       !ids.includes(body.deliveryId)||
       body.receipt!=='none'||
       !['inventory_full','inventory_unavailable','player_offline',
         'vip_not_configured','vip_not_loaded','invalid_item'].includes(body.reason))
      return respond(res,409,{error:'not_safe_to_retry'});
    const released=await bridge.releaseBeforeGrant(body.deliveryId,body.reason,'none');
    if(released.status!=='retryable')return respond(res,409,{error:'retry_held'});
    return respond(res,200,{simulation:true,environment:'verified_pix_emulator',
      deliveryId:body.deliveryId,retryable:true});
   }
   if(Object.keys(body).length!==2||!VALID_ID.test(body.deliveryId)||
      body.result!=='applied'||!ids.includes(body.deliveryId))
     return respond(res,409,{error:'ack_not_offered'});
   const acknowledged=await bridge.acknowledge(body.deliveryId,'applied');
   if(acknowledged.status!=='acknowledged')
     return respond(res,409,{error:'ack_held'});
   return respond(res,200,{simulation:true,environment:'verified_pix_emulator',
     deliveryId:body.deliveryId,acknowledged:true});
  }catch {
   if(!res.headersSent)respond(res,503,{error:'fail_closed'});else res.destroy();
  }
 });
}
module.exports={createVerifiedOutboxServer};
