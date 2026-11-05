/**
 * Bedrock Dedicated Server @minecraft/server-net transport for the VIP MVP.
 *
 * This module imports NO Minecraft runtime dependencies on its own. A verified
 * BDS-only bootstrap must inject http, HttpRequest, HttpHeader,
 * HttpRequestMethod and a SecretString from @minecraft/server-admin.
 * Never store or send tokens through player commands or script events.
 *
 * Does not grant, schedule, or poll on its own. BDS host permissions must be
 * reviewed before it can be wired to a production Core entrypoint.
 */
const URL=/^https:\/\/[a-z0-9.-]+(?::[0-9]{2,5})?\/api\/delivery\/bds$/i;
const NAME=/^[A-Za-z0-9_ ]{3,32}$/;
const ID=/^[a-f0-9]{64}-(0|[1-9][0-9]{0,2})$/;
const LEASE=/^[a-f0-9]{32}$/;
const CHARS='0123456789abcdef';
const randomHex=()=>Array.from({length:32},
  ()=>CHARS[Math.floor(Math.random()*16)]).join('');
export function createBdsMvpNetTransport({http,HttpRequest,HttpHeader,
  HttpRequestMethod,secret,baseUrl,clock=Date.now,nonce=randomHex}){
  if(!URL.test(baseUrl||'')||typeof secret!=='object' || !secret ||
     typeof http?.request!=='function' ||
     typeof HttpRequest!=='function'||typeof HttpHeader!=='function' ||
     !HttpRequestMethod?.Post)
    throw Error('BDS_MVP_NET_CONFIGURATION_BLOCKED');
  let busy=false;
  async function request(action,body){
    if(busy)throw Error('BDS_MVP_REQUEST_ALREADY_RUNNING');
    busy=true;
    try{
      const ts=String(clock()),n=nonce();
      if(!/^[0-9]{13}$/.test(ts)||!/^[a-f0-9]{32}$/.test(n))
        throw Error('BDS_MVP_CLOCK_OR_NONCE_INVALID');
      const payload=JSON.stringify(body);
      if(payload.length>4096)throw Error('BDS_MVP_REQUEST_TOO_LARGE');
      const req=new HttpRequest(baseUrl+'/'+action);
      req.method=HttpRequestMethod.Post;
      req.timeout=8;
      req.headers=[
        new HttpHeader('Content-Type','application/json'),
        new HttpHeader('x-nc-bds-token',secret),
        new HttpHeader('x-nc-nonce',n),
        new HttpHeader('x-nc-timestamp',ts),
      ];
      req.body=payload;
      const res=await http.request(req);
      if(Number(res?.status)!==200 || typeof res?.body!=='string' ||
         res.body.length>32768)throw Error('BDS_MVP_GATEWAY_UNAVAILABLE');
      const data=JSON.parse(res.body);
      if(!data || typeof data!=='object'||Array.isArray(data))
        throw Error('BDS_MVP_REPLY_INVALID');
      return data;
    } finally {busy=false;}
  }
  return Object.freeze({
    poll:gamertag=>{
      if(!NAME.test(gamertag||''))throw Error('BDS_MVP_PLAYER_INVALID');
      return request('poll',{gamertag,online:true});
    },
    ack:(deliveryId,leaseToken,result)=>{
      if(!ID.test(deliveryId||'')||!LEASE.test(leaseToken||'')||
         !['applied','already_applied'].includes(result))
        throw Error('BDS_MVP_ACK_INVALID');
      return request('ack',{deliveryId,leaseToken,result});
    },
    nack:(deliveryId,leaseToken,reason,receipt)=>{
      if(!ID.test(deliveryId||'')||!LEASE.test(leaseToken||'')||
         !['none','started','applied','unknown'].includes(receipt))
        throw Error('BDS_MVP_NACK_INVALID');
      return request('nack',{deliveryId,leaseToken,reason,receipt});
    },
  });
}
