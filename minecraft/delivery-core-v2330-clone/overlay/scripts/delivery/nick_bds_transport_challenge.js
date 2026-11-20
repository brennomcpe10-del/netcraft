/**
 * NetCraftCore 2.3.30 compatibility candidate, BDS-only, LAB OFF.
 * Pure dependency-injected module. Nothing runs on import.
 * Never generate request nonces with non-cryptographic random values(); the reviewed private
 * HTTPS gateway issues 128-bit cryptographic challenge nonces per request.
 * Server-admin SecretString remains opaque inside HttpHeader.
 *
 * This is NOT installed in the user's NetCraftCore or MagnoHost.
 */
const URL=/^https:\/\/(?:localhost|127\.0\.0\.1)(?::18443)?\/api\/delivery\/bds$|^https:\/\/[a-z0-9][a-z0-9.-]{1,190}(?::443)?\/api\/delivery\/bds$/i;
const NAME=/^[A-Za-z0-9_ ]{3,32}$/;
const SESSION=/^[A-Za-z0-9_:\-.]{1,128}$/;
const CODE=/^NC-[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/;
const ID=/^[a-f0-9]{64}-(0|[1-9][0-9]{0,2})$/;
const LEASE=/^[a-f0-9]{32}$/;
const NONCE=/^[a-f0-9]{32}$/;
const TS=/^[0-9]{13}$/;
export function createNickBdsTransportChallenge({
  http,HttpRequest,HttpHeader,HttpRequestMethod,secret,baseUrl,
  previewBypassSecret=undefined,
  clock=Date.now,
}){
  if(!URL.test(baseUrl||'')||typeof HttpRequest!=='function'||
     typeof HttpHeader!=='function'||!secret||typeof secret!=='object'||
     typeof http?.request!=='function'||!HttpRequestMethod?.Post||
     typeof clock!=='function'||
     (previewBypassSecret!==undefined&&
      (!previewBypassSecret||typeof previewBypassSecret!=='object')))
    throw Error('GATEWAY_CONFIGURATION_INVALID');
  let busy=false;
  const post=async(action,body,headers)=>{
    const req=new HttpRequest(baseUrl+'/'+action);
    req.method=HttpRequestMethod.Post;
    req.timeout=8;
    req.body=body;
    req.headers=[
      new HttpHeader('Content-Type','application/json'),
      new HttpHeader('x-nc-bds-token',secret),
      ...(previewBypassSecret?[new HttpHeader('x-vercel-protection-bypass',previewBypassSecret)]:[]),
      ...headers,
    ];
    const response=await http.request(req);
    if(Number(response?.status)!==200||typeof response?.body!=='string'||
       response.body.length>32768)throw Error('GATEWAY_UNAVAILABLE');
    const data=JSON.parse(response.body);
    if(!data||typeof data!=='object'||Array.isArray(data))
      throw Error('GATEWAY_RESPONSE_INVALID');
    return data;
  };
  async function request(action,payload){
    if(busy)throw Error('GATEWAY_BUSY');
    busy=true;
    try{
      const body=JSON.stringify(payload);
      if(body.length>4096)throw Error('REQUEST_TOO_LARGE');
      // Challenge alone cannot grant anything. No unauthenticated polling.
      const challenge=await post('challenge','{"schema":1}',[]);
      if(challenge.schema!==1||challenge.simulation!==false||
         challenge.dispatchEnabled!==false||!NONCE.test(challenge.nonce||'')||
         !TS.test(challenge.timestamp||'')||
         Math.abs(Number(challenge.timestamp)-clock())>60000)
        throw Error('SECURE_CHALLENGE_UNAVAILABLE');
      return await post(action,body,[
        new HttpHeader('x-nc-nonce',challenge.nonce),
        new HttpHeader('x-nc-timestamp',challenge.timestamp),
      ]);
    }finally{busy=false;}
  }
  return Object.freeze({
    poll:(gamertag,sessionId=undefined)=>{
      if(!NAME.test(gamertag||'')||gamertag.trim()!==gamertag||
         (sessionId!==undefined&&!SESSION.test(sessionId)))
        throw Error('INVALID_GAMERTAG_OR_SESSION');
      return request('poll',{gamertag,online:true,
        ...(sessionId===undefined?{}:{sessionId})});
    },
    ack:(deliveryId,leaseToken,result,sessionId=undefined)=>{
      if(!ID.test(deliveryId||'')||!LEASE.test(leaseToken||'')||
         !['applied','already_applied'].includes(result)||
         (sessionId!==undefined&&!SESSION.test(sessionId)))
        throw Error('INVALID_ACK');
      return request('ack',{deliveryId,leaseToken,result,
        ...(sessionId===undefined?{}:{sessionId})});
    },
    link:(code,gamertag,sessionId)=>{
      if(!CODE.test(code||'')||!NAME.test(gamertag||'')||
         gamertag.trim()!==gamertag||!SESSION.test(sessionId||''))
        throw Error('INVALID_GAME_LINK');
      return request('link',{code,gamertag,sessionId});
    },
    nack:(deliveryId,leaseToken,reason,receipt)=>{
      if(!ID.test(deliveryId||'')||!LEASE.test(leaseToken||'')||
         typeof reason!=='string'||reason.length>64||
         !['none','started','applied','unknown'].includes(receipt))
        throw Error('INVALID_NACK');
      return request('nack',{deliveryId,leaseToken,reason,receipt});
    },
  });
}
