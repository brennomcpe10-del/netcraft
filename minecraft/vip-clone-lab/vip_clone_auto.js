/**
 * NetCraft VIP CLONE AUTO v2.3.40 - clone-only, strictly synthetic.
 * No commercial release, Pix, orders, or main-server integration.
 * Installed ONLY in a separately numbered, non-production BDS Core clone.
 */
const NAME=/^[A-Za-z0-9_ ]{3,32}$/,NONCE=/^[a-f0-9]{32}$/,
  TS=/^[0-9]{13}$/,ID=/^[a-f0-9]{64}-0$/,
  RANK=new Set(['ncbr:vip_explorer','ncbr:vip_elite','ncbr:vip_supreme']),
  URL=/^https:\/\/[a-z0-9][a-z0-9.-]{1,190}\/api\/delivery\/lab-clone-vip\/bds$/i;
const LOG='[NCBR VIP CLONE AUTO V240]';
const read=(v,k)=>{try{return v?.get?.(k);}catch{return undefined;}};
function safePayload(job,owner){
  return job&&typeof job==='object'&&!Array.isArray(job)&&
    Object.keys(job).sort().join(',')===
      'contract,days,gamertag,id,kind,orderId,rankTag'&&
    job.contract==='netcraft.delivery.v1'&&job.kind==='vip'&&
    ID.test(job.id||'')&&job.orderId===job.id.slice(0,64)&&
    job.gamertag===owner&&RANK.has(job.rankTag)&&job.days===30;
}
export function createCloneVipAutoPump({
  world,Server,transport,createExecutor,owner,system,log=console.warn,
}){
  let busy=false,grantActive=false,activeId='',activePlayer=null,pending=null;
  const verifyLinkedPlayer=(p,j)=>grantActive&&
    p?.isValid===true&&p?.name===owner&&
    p?.id===activePlayer?.id&&j?.gamertag===owner&&
    j?.id===activeId&&Server?.DeliveryLink?.isPlayerLinked?.(p)===true;
  const executor=createExecutor({
    isDispatchApproved:()=>grantActive,verifyLinkedPlayer,
  });
  const ensureRank=(rank)=>{
    const vip=Server?.VIPSystem,tier=rank.slice('ncbr:vip_'.length);
    const plan={explorer:'Explorer',elite:'Elite',supreme:'Supreme'}[tier];
    if(!plan||!vip?.vipRanks?.get||!Server?.Ranks?.getRank)return false;
    if(!vip.vipRanks.get(rank)){
      vip.vipRanks.set(rank,{
        name:plan,displayName:'VIP '+plan,defaultDays:30,order:-200000,
        features:{effects:false,pet:false},
      });
    }
    if(!Server.Ranks.getRank(rank)){
      Server.Ranks.createRank(rank,{
        displayName:'VIP '+plan,order:-200000,
        permissions:{},adminPermissions:{},landPermissions:{},chestShopPermissions:{},
        hideRanks:false,
      });
    }
    return !!vip.vipRanks.get(rank)&&!!Server.Ranks.getRank(rank);
  };
  async function sendFinal(p){
    const endpoint=p.result==='applied'||p.result==='already_applied'?'ack':'nack';
    const body={receiptId:p.receiptId,leaseToken:p.leaseToken,
      gamertag:owner,sessionId:p.sessionId,result:p.result};
    const response=await transport.request(endpoint,body);
    if(!['acknowledged_clone','manual_review'].includes(response?.status))
      throw Error('CLONE_ACK_UNCONFIRMED');
    return response;
  }
  async function tick(){
    if(busy)return;
    busy=true;
    try{
      const players=world.getAllPlayers().filter(p=>p?.isValid===true&&
        p?.typeId==='minecraft:player'&&p?.name===owner&&p.hasTag?.('admin'));
      if(players.length!==1)return;
      const player=players[0];
      // The same actual clone player must have confirmed a 10-minute code
      // in this server, not merely matched a browser-supplied gamertag.
      if(Server?.DeliveryLink?.isPlayerLinked?.(player)!==true)return;
      if(!NAME.test(owner)||typeof player.id!=='string'||
         !/^[A-Za-z0-9_:\-.]{1,128}$/.test(player.id))return;
      if(pending){
        if(pending.sessionId===player.id){
          try{
            const done=await sendFinal(pending);
            log(LOG+' confirmed='+done.status+' tier='+pending.rankTag);
            pending=null;
          }catch{log(LOG+' ACK_NOT_CONFIRMED; no new grant');}
        }
        return;
      }
      const answer=await transport.request('poll',{
        gamertag:owner,sessionId:player.id,
      });
      if(answer?.schema!==1||answer.cloneOnly!==true||
         answer.simulation!==true||answer.commercialDispatchEnabled!==false||
         answer.paymentsEnabled!==false)
        throw Error('INVALID_CLONE_GATEWAY_RESPONSE');
      const offer=answer.offer;
      if(offer===null)return;
      if(!offer||!NONCE.test(offer.leaseToken||'')||
         !safePayload(offer.payload,owner))
        throw Error('INVALID_CLONE_VIP_OFFER');
      const job=offer.payload,receiptId=String(offer.receiptId||'');
      // The origin must bind each offered lease to an exact Preview receipt.
      if(!/^[a-f0-9]{64}$/.test(receiptId))throw Error('INVALID_CLONE_RECEIPT');
      let outcome='manual_review';
      const previousAuth=Server.DeliveryAuthorization;
      const previousIdentity=Server.DeliveryIdentity;
      try{
        if(!ensureRank(job.rankTag))outcome='vip_not_configured';
        else{
          grantActive=true;activePlayer=player;activeId=job.id;
          // The real NetCraftCore VIP writer requires TWO server-owned
          // callbacks as well as a successful executor identity check.
          // Install both ONLY during this one authenticated clone offer,
          // restoring the original Core services in all outcomes.
          Server.DeliveryAuthorization={
            isReleaseApproved:()=>grantActive===true,
          };
          Server.DeliveryIdentity={
            isPlayerLinked:p=>p?.id===player.id&&
              Server?.DeliveryLink?.isPlayerLinked?.(p)===true,
            verifyLinkedPlayer:(p,j)=>verifyLinkedPlayer(p,j),
          };
          outcome=executor.execute(job)?.status||'manual_review';
        }
      }catch{outcome='manual_review';}
      finally{
        grantActive=false;activePlayer=null;activeId='';
        if(previousAuth===undefined)delete Server.DeliveryAuthorization;
        else Server.DeliveryAuthorization=previousAuth;
        if(previousIdentity===undefined)delete Server.DeliveryIdentity;
        else Server.DeliveryIdentity=previousIdentity;
      }
      const result=outcome==='applied'||outcome==='already_applied'
        ?outcome:'manual_review';
      pending={receiptId,leaseToken:offer.leaseToken,
        sessionId:player.id,rankTag:job.rankTag,result};
      log(LOG+' applied-result='+result+' rank='+job.rankTag+
        ' commercial=OFF; awaiting clone ACK');
      // An ACK failure is retried in memory; reboot leaves the job held for
      // manual reconciliation, NEVER an automatic second VIP.
      try{
        const done=await sendFinal(pending);
        log(LOG+' confirmed='+done.status);
        pending=null;
      }catch{log(LOG+' ACK_NOT_CONFIRMED; no new grant');}
    }catch{
      log(LOG+' POLL_FAILED_OR_REJECTED; no grant');
    }finally{busy=false;}
  }
  system.runInterval(()=>{void tick();},160);
  log(LOG+' READY_CLONE_ONLY_NO_COMMERCIAL_DISPATCH owner='+owner);
  return Object.freeze({tick,receiptStatus:executor.receiptStatus,
    getPending:()=>!!pending});
}
export async function installVipCloneAuto({
  Server,world,system,variables,secrets,createExecutor,
  loadNet=()=>import('@minecraft/server-net'),
}){
  if(read(variables,'NCBR_VIP_CLONE_AUTO_ENABLED')!==true)
    return {enabled:false,reason:'AUTO_OFF'};
  if(read(variables,'NCBR_VIP_CLONE_GUARD')!=='I_ACK_ISOLATED_WORLD_2_3_40'||
     read(variables,'NCBR_DELIVERY_ENABLED')!=='OFF'||
     read(variables,'NCBR_DELIVERY_LINK_ENABLED')!==true)
    return {enabled:false,reason:'CLONE_GUARDS_REJECTED'};
  const owner=read(variables,'NCBR_VIP_CLONE_GAMERTAG');
  const url=read(variables,'NCBR_VIP_CLONE_AUTO_URL');
  if(!NAME.test(owner||'')||owner.trim()!==owner||!URL.test(url||''))
    return {enabled:false,reason:'INVALID_CLONE_CONFIG'};
  const token=read(secrets,'NCBR_VIP_CLONE_BDS_TOKEN');
  const bypass=read(secrets,'NCBR_DELIVERY_PREVIEW_BYPASS');
  if(!token||typeof token!=='object'||!bypass||typeof bypass!=='object')
    return {enabled:false,reason:'CLONE_PRIVATE_SECRETS_MISSING'};
  if(typeof createExecutor!=='function'||!Server?.VIPSystem?.grantDeliveryVIPLab||
     !Server?.VIPSystem?.vipRanks?.get||!Server?.Ranks?.createRank)
    return {enabled:false,reason:'CLONE_CORE_NOT_READY'};
  let net;
  try{net=await loadNet();}catch{
    return {enabled:false,reason:'CLONE_NET_API_UNAVAILABLE'};
  }
  const transport={
    request:async(action,body)=>{
      async function post(name,body,headers=[]){
        const req=new net.HttpRequest(url+'/'+name);
        req.method=net.HttpRequestMethod.Post;
        req.timeout=8;
        req.body=JSON.stringify(body);
        req.headers=[
          new net.HttpHeader('Content-Type','application/json'),
          new net.HttpHeader('x-nc-clone-token',token),
          new net.HttpHeader('x-vercel-protection-bypass',bypass),
          ...headers,
        ];
        const response=await net.http.request(req);
        if(Number(response?.status)!==200||
           typeof response?.body!=='string'||response.body.length>16384)
          throw Error('CLONE_HTTP_UNAVAILABLE');
        return JSON.parse(response.body);
      }
      const challenge=await post('challenge',{schema:1});
      if(challenge?.schema!==1||challenge?.cloneOnly!==true||
         challenge?.simulation!==true||
         challenge?.commercialDispatchEnabled!==false||
         challenge?.paymentsEnabled!==false||
         !NONCE.test(challenge?.nonce||'')||!TS.test(challenge?.timestamp||'')||
         Math.abs(Date.now()-Number(challenge.timestamp))>60_000)
        throw Error('CLONE_CHALLENGE_REJECTED');
      return post(action,body,[
        new net.HttpHeader('x-nc-nonce',challenge.nonce),
        new net.HttpHeader('x-nc-timestamp',challenge.timestamp),
      ]);
    },
  };
  createCloneVipAutoPump({world,Server,transport,createExecutor,owner,system});
  return {enabled:true,mode:'CLONE_ONLY',commercial:false};
}
