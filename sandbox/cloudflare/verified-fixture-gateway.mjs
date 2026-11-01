// NetCraft verified-fixture gateway CANDIDATE. NOT referenced by wrangler.toml.
// No real Pix, Firebase, production credentials, public reward authorisation
// or user data. Enable ONLY on an isolated clone Worker with disposable token.
// The same BDS v0.3.1 verifier accepts these strictly bounded labFixture jobs.
const PLAYER = /^[A-Za-z0-9_ ]{1,32}$/;
const ID = /^[a-f0-9]{64}-(0|[1-9]\d{0,2})$/;
const NONCE = /^[a-f0-9]{32}$/;
const ORDER_ID = 'a'.repeat(64);
const KIT_ID = ORDER_ID + '-0';
const VIP_ID = ORDER_ID + '-1';
const FIXTURE = Object.freeze([
  { contract:'netcraft.delivery.v1',labFixture:true,id:KIT_ID,
    orderId:ORDER_ID,kind:'items',items:[
      {itemId:'minecraft:diamond',quantity:3},
      {itemId:'minecraft:iron_ingot',quantity:6},
    ] },
  { contract:'netcraft.delivery.v1',labFixture:true,id:VIP_ID,
    orderId:ORDER_ID,kind:'vip',rankTag:'ncbr:vip_explorer',days:30 },
]);
const json=(payload,status=200)=>new Response(JSON.stringify(payload),{
  status,headers:{'content-type':'application/json','cache-control':'no-store'}
});
const fixed=(a,b)=>{
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length||
    a.length<32||a.length>256) return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
};
function randomNonce(){
  if(!globalThis.crypto?.getRandomValues) return null;
  const bytes=new Uint8Array(16);
  try{globalThis.crypto.getRandomValues(bytes);}catch{return null;}
  return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
}
const OFF=()=>json({error:'fixture_gateway_disabled'},503);
const validToken=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const decode=async req=>{
  if(!req.headers.get('content-type')?.startsWith('application/json'))return null;
  const size=req.headers.get('content-length');
  if(size!==null&&(!/^\d{1,5}$/.test(size)||Number(size)>2048))return null;
  const raw=await req.text();
  if(raw.length>2048)return null;
  try{
    const value=JSON.parse(raw);
    return value&&typeof value==='object'&&!Array.isArray(value)?value:null;
  }catch{return null;}
};
export class FixtureDeliveryGate {
  constructor(ctx){this.ctx=ctx;}
  async fetch(req) {
    if(req.method!=='POST')return json({error:'invalid_method'},405);
    const data=await decode(req);
    if(!data)return json({error:'bad_request'},400);
    const operation=data.operation;
    const now=Date.now();
    const kv=this.ctx.storage.kv;
    // In a DO, only this one actor serialises changes for this fixture.
    if(operation==='issue'){
      if(!NONCE.test(data.nonce||'')||Object.keys(data).length!==2)
        return json({error:'bad_nonce'},400);
      if(kv.get('issued:'+data.nonce)!==undefined ||
          kv.get('spent:'+data.nonce)!==undefined)return json({error:'replay'},409);
      kv.put('issued:'+data.nonce,now);
      return json({issued:true});
    }
    if(operation==='apply'){
      if(!NONCE.test(data.nonce||'')||Object.keys(data).length!==3||
          !['poll','ack','nack'].includes(data.action))
        return json({error:'invalid_action'},400);
      const issued=kv.get('issued:'+data.nonce);
      if(typeof issued!=='number'||issued>now||now-issued>60000||
          kv.get('spent:'+data.nonce)!==undefined)
        return json({error:'nonce_invalid'},401);
      kv.delete('issued:'+data.nonce);
      kv.put('spent:'+data.nonce,now);
      return json({accepted:true});
    }
    if(operation==='poll'){
      if(Object.keys(data).length!==2||!PLAYER.test(data.gamertag||'')||
          data.gamertag!==data.gamertag.trim())return json({error:'bad_player'},400);
      const result=[];
      for(const item of FIXTURE){
        const key='grant:'+item.id;
        const state=kv.get(key);
        if(state===undefined || state==='safe_retry'){
          kv.put(key,'offered');
          result.push({...item,gamertag:data.gamertag});
        }
      }
      return json({deliveries:result});
    }
    if(operation==='ack'){
      if(Object.keys(data).length!==3||![KIT_ID,VIP_ID].includes(data.deliveryId)||
          !['applied','already_applied'].includes(data.result))
        return json({error:'invalid_ack'},400);
      const key='grant:'+data.deliveryId;
      if(kv.get(key)==='acknowledged')return json({acknowledged:true,duplicate:true});
      if(kv.get(key)!=='offered')return json({error:'not_offered'},409);
      kv.put(key,'acknowledged');
      return json({acknowledged:true,duplicate:false});
    }
    if(operation==='nack'){
      if(Object.keys(data).length!==4||![KIT_ID,VIP_ID].includes(data.deliveryId)||
          data.receipt!=='none'||
          !['inventory_full','inventory_unavailable','player_offline',
            'vip_not_configured','vip_not_loaded','invalid_item'].includes(data.reason))
        return json({error:'not_safe'},409);
      const key='grant:'+data.deliveryId;
      if(kv.get(key)!=='offered')return json({error:'not_offered'},409);
      kv.put(key,'safe_retry');
      return json({retryable:true});
    }
    if(operation==='inspect'){
      // No mutating debug endpoint; this is only unit-test internal DO.
      if(Object.keys(data).length!==2||![KIT_ID,VIP_ID].includes(data.deliveryId))
        return json({error:'invalid_id'},400);
      return json({state:kv.get('grant:'+data.deliveryId)??'not_offered'});
    }
    return json({error:'unsupported_operation'},404);
  }
}
export default {
  async fetch(req,env){
    if(env.NC_SANDBOX_ENABLED!=='true'||env.NC_FIXTURE_DELIVERY_ENABLED!=='true'||
       env.VERCEL_ENV||!validToken(env.NC_BDS_TEST_TOKEN)||
       !PLAYER.test(env.NC_TEST_GAMERTAG||'')||
       env.NC_TEST_GAMERTAG!==env.NC_TEST_GAMERTAG.trim()||
       !env.FIXTURE_GATE)return OFF();
    const url=new URL(req.url),route=url.pathname;
    if(route==='/health'&&req.method==='GET')
      return json({simulation:true,environment:'verified_pix_emulator',
        dispatchEnabled:false,realPayments:false,deliveryEnabled:false});
    if(req.method!=='POST'||!['/delivery/challenge','/delivery/poll',
      '/delivery/ack','/delivery/nack'].includes(route))return json({error:'not_found'},404);
    if(!fixed(req.headers.get('x-nc-bds-token'),env.NC_BDS_TEST_TOKEN))
      return json({error:'unauthorized'},401);
    if(req.headers.get('content-type')?.startsWith('application/json')!==true)
      return json({error:'unsupported_media_type'},415);
    const body=await decode(req);
    if(!body)return json({error:'invalid_json'},400);
    const gate=env.FIXTURE_GATE.get(env.FIXTURE_GATE.idFromName('netcraft-fixture-delivery-v1'));
    const invoke=async data=>{
      const r=await gate.fetch('https://internal/',{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)
      });
      if(!r.ok)return {error:true,status:r.status};
      return r.json();
    };
    if(route==='/delivery/challenge'){
      if(Object.keys(body).length!==0)return json({error:'invalid_challenge'},400);
      const nonce=randomNonce();
      if(!nonce)return json({error:'secure_random_unavailable'},503);
      const issued=await invoke({operation:'issue',nonce});
      if(issued.error)return json({error:'challenge_unavailable'},503);
      return json({simulation:true,environment:'verified_pix_emulator',nonce});
    }
    const nonce=req.headers.get('x-nc-nonce')||'';
    const stamp=req.headers.get('x-nc-timestamp')||'';
    if(!NONCE.test(nonce)||!/^\d{13}$/.test(stamp)||
       Math.abs(Date.now()-Number(stamp))>60000)
      return json({error:'unauthorized'},401);
    // Validate arguments BEFORE spending a challenge. The DO still performs
    // the final serialised check/claim, including after process restarts.
    if(route==='/delivery/poll'){
      if(Object.keys(body).length!==1||body.gamertag!==env.NC_TEST_GAMERTAG)
        return json({error:'wrong_player'},403);
    }else if(route==='/delivery/ack'){
      if(Object.keys(body).length!==2||![KIT_ID,VIP_ID].includes(body.deliveryId)||
          body.result!=='applied')return json({error:'invalid_ack'},409);
    }else if(route==='/delivery/nack'){
      if(Object.keys(body).length!==3||![KIT_ID,VIP_ID].includes(body.deliveryId)||
          body.receipt!=='none'||!['inventory_full','inventory_unavailable',
          'player_offline','vip_not_configured','vip_not_loaded','invalid_item'].includes(body.reason))
        return json({error:'invalid_nack'},409);
    }
    const consumed=await invoke({operation:'apply',action:route.slice(10),nonce});
    if(consumed.error)return json({error:consumed.status===401?'nonce_invalid':'gateway_unavailable'},
      consumed.status===401?401:503);
    const result=await invoke(route==='/delivery/poll'
      ? {operation:'poll',gamertag:body.gamertag}
      : route==='/delivery/ack'
        ? {operation:'ack',deliveryId:body.deliveryId,result:body.result}
        : {operation:'nack',deliveryId:body.deliveryId,receipt:body.receipt,reason:body.reason});
    if(result.error)return json({error:'grant_held'},409);
    if(route==='/delivery/poll')return json({simulation:true,
      environment:'verified_pix_emulator',dispatchEnabled:false,
      deliveries:result.deliveries});
    if(route==='/delivery/ack')return json({simulation:true,
      environment:'verified_pix_emulator',deliveryId:body.deliveryId,
      acknowledged:result.acknowledged});
    return json({simulation:true,environment:'verified_pix_emulator',
      deliveryId:body.deliveryId,retryable:result.retryable});
  }
};
