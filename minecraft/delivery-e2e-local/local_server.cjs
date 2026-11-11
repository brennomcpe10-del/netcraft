'use strict';
// NetCraftCore synthetic E2E lab HTTPS server. Loopback ONLY. No Pix,
// customer data, Cloudflare, remote APIs, or web-facing listener.
const https = require('node:https');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const ORDER_ID='d'.repeat(64), ITEM_ID=ORDER_ID+'-0', VIP_ID=ORDER_ID+'-1', KIT_ID=ORDER_ID+'-2', RENEW_ID=ORDER_ID+'-3';
const EXPLORER='ncbr:vip_explorer';
function createLocalServer({pfx,passphrase,key,cert,token,gamertag,kind='items',rankTag,receiptPath}) {
 if (!/^[a-f0-9]{64}$/.test(token||'')) throw Error('synthetic_token_invalid');
 if (!/^[A-Za-z0-9_ ]{1,32}$/.test(gamertag||'') || gamertag.trim()!==gamertag) throw Error('lab_gamertag_invalid');
 if (!['items','vip','kit','suite'].includes(kind)) throw Error('lab_kind_invalid');
 if ((kind==='vip'||kind==='suite') && rankTag!==EXPLORER) throw Error('lab_rank_invalid');
 if (!receiptPath) throw Error('receipt_path_required');
 const issued=new Map(),used=new Map();
 const disk = (()=>{try {return JSON.parse(fs.readFileSync(receiptPath,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}})();
 if (!disk||typeof disk!=='object'||Array.isArray(disk)) throw Error('invalid_receipts');
 const common={contract:'netcraft.delivery.v1',labFixture:true,orderId:ORDER_ID,gamertag};
 const fixtures={
  items:{...common,id:ITEM_ID,kind:'items',items:[{itemId:'minecraft:iron_ingot',quantity:2}]},
  vip:{...common,id:VIP_ID,kind:'vip',rankTag:EXPLORER,days:1},
  vip_renew:{...common,id:RENEW_ID,kind:'vip',rankTag:EXPLORER,days:1},
  kit:{...common,id:KIT_ID,kind:'items',items:[{itemId:'minecraft:diamond',quantity:3},{itemId:'minecraft:iron_ingot',quantity:6}]}
 };
 const selected=kind==='suite'?['vip','vip_renew','kit']:[kind], ids=new Set(selected.map(x=>fixtures[x].id));
 const offered=new Set();
 const send=(res,status,obj)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(obj));};
 const persist=()=>{
  const tmp=receiptPath+'.tmp';fs.writeFileSync(tmp,JSON.stringify(disk),{flag:'w',mode:0o600});fs.renameSync(tmp,receiptPath);
 };
 return https.createServer({... (pfx ? {pfx,passphrase}:{cert,key}),minVersion:'TLSv1.2'},async(req,res)=>{
  try {
    if (!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return send(res,403,{error:'loopback_only'});
    if (req.method!=='POST'|| !['/delivery/challenge','/delivery/poll','/delivery/ack'].includes(req.url))
      return send(res,404,{error:'route_denied'});
    if (!String(req.headers['content-type']||'').startsWith('application/json')) return send(res,415,{error:'content_type'});
    const provided=Buffer.from(String(req.headers['x-nc-bds-token']||''));
    const expected=Buffer.from(token);
    if (provided.length!==expected.length||!crypto.timingSafeEqual(provided,expected))return send(res,401,{error:'unauthorized'});
    let bytes=0;const chunks=[];
    for await (const buf of req){bytes+=buf.length;if(bytes>1024)return send(res,413,{error:'too_large'});chunks.push(buf);}
    let body;try {body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(res,400,{error:'invalid_json'});}
    if (!body||typeof body!=='object'||Array.isArray(body))return send(res,400,{error:'invalid_body'});
    if(req.url==='/delivery/challenge'){
      if(Object.keys(body).length!==0)return send(res,400,{error:'bad_challenge'});
      const now=Date.now();for(const [key,time] of issued)if(now-time>60000)issued.delete(key);
      for(const [key,time] of used)if(now-time>120000)used.delete(key);
      const nonce=crypto.randomBytes(16).toString('hex');issued.set(nonce,now);
      return send(res,200,{environment:'synthetic_local',simulation:true,nonce});
    }
    const nonce=String(req.headers['x-nc-nonce']||''),stamp=String(req.headers['x-nc-timestamp']||''),now=Date.now();
    if(!/^[a-f0-9]{32}$/.test(nonce)||!/^[0-9]{13}$/.test(stamp)||Math.abs(now-Number(stamp))>60000||
       used.has(nonce)||!issued.has(nonce)||now-issued.get(nonce)>60000)return send(res,401,{error:'replay_or_expired'});
    issued.delete(nonce);used.set(nonce,now);
    if (req.url==='/delivery/poll'){
      if(Object.keys(body).length!==1||body.gamertag!==gamertag)return send(res,400,{error:'wrong_player'});
      return send(res,200,{simulation:true,environment:'synthetic_local',dispatchEnabled:false,
        deliveries:selected.filter(x=>!disk[fixtures[x].id]?.acknowledged).map(x=>{offered.add(fixtures[x].id);return fixtures[x];})});
    }
    if(Object.keys(body).length!==2||!ids.has(body.deliveryId)||body.result!=='applied')return send(res,400,{error:'invalid_ack'});
    if(!offered.has(body.deliveryId)&&!disk[body.deliveryId]?.acknowledged)return send(res,409,{error:'not_offered'});
    if(!disk[body.deliveryId]?.acknowledged){disk[body.deliveryId]={acknowledged:true,at:new Date().toISOString(),kind:fixtures[selected.find(x=>fixtures[x].id===body.deliveryId)].kind};persist();}
    return send(res,200,{simulation:true,environment:'synthetic_local',deliveryId:body.deliveryId,acknowledged:true});
  }catch{if(!res.headersSent)send(res,500,{error:'internal'});else res.destroy();}
 });
}
if(require.main===module){
 if(process.env.NC_DELIVERY_E2E_LOCAL!=='1'||process.env.NODE_ENV==='production'||process.env.VERCEL_ENV)throw Error('local_test_only');
 const dir=process.env.NC_E2E_LAB_DIR||__dirname;
 const config=JSON.parse(fs.readFileSync(path.join(dir,'synthetic.json'),'utf8'));
 const srv=createLocalServer({pfx:fs.readFileSync(path.join(dir,'gate-c2-cert.pfx')),
  passphrase:process.env.NC_GATE_C_PFX_PASSWORD,token:config.nc_delivery_e2e_token,
  gamertag:config.gamertag,kind:config.kind||'items',rankTag:config.rankTag,
  receiptPath:path.join(dir,'e2e-receipts.json')});
 srv.listen(18443,'127.0.0.1',()=>console.log('NETCRAFT_DELIVERY_E2E_SERVER_READY'));
}
module.exports={createLocalServer};
