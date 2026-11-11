/**
 * NetCraftCore VIP CLONE v2.3.39: synthetic, admin-only, local test trigger.
 * No HTTPS, browser input, code redemption, payments or commercial dispatch.
 * Not part of the official Core. NEVER install in Mundo Eterno.
 */
const TIERS = Object.freeze({
  explorer: Object.freeze({orderId:'a'.repeat(64),rankTag:'ncbr:vip_explorer',name:'Explorer'}),
  elite: Object.freeze({orderId:'b'.repeat(64),rankTag:'ncbr:vip_elite',name:'Elite'}),
  supreme: Object.freeze({orderId:'c'.repeat(64),rankTag:'ncbr:vip_supreme',name:'Supreme'}),
});
const EXPECTED_ACK='I_ACK_ISOLATED_WORLD_2_3_39';
const NAME=/^[A-Za-z0-9_ ]{3,32}$/;
const LOG='[NCBR VIP CLONE V239]';
const read=(variables,key)=>{try{return variables?.get?.(key);}catch{return undefined;}};

export function installVipCloneLab({Server,world,system,variables,createExecutor}) {
  const disabled=(why)=>{
    console.warn(LOG+' OFF '+why);
    return Object.freeze({enabled:false,why});
  };
  // All three independent fail-closed gates must exist in clone config.
  if(read(variables,'NCBR_VIP_CLONE_GUARD')!==EXPECTED_ACK)
    return disabled('MISSING_EXPLICIT_ISOLATED_WORLD_ACK');
  if(read(variables,'NCBR_DELIVERY_ENABLED')!=='OFF'||
     read(variables,'NCBR_DELIVERY_LINK_ENABLED')===true)
    return disabled('PAYMENT_OR_LINK_ENABLED');
  const owner=read(variables,'NCBR_VIP_CLONE_GAMERTAG');
  if(typeof owner!=='string'||!NAME.test(owner)||owner!==owner.trim())
    return disabled('UNTRUSTED_TEST_PLAYER');
  if(typeof createExecutor!=='function'||
     !Server?.VIPSystem?.vipRanks?.get||
     typeof Server?.VIPSystem?.grantDeliveryVIPLab!=='function'||
     !Server?.Ranks?.getRank||!Server?.Ranks?.createRank||
     !system?.afterEvents?.scriptEventReceive?.subscribe)
    return disabled('CORE_INCOMPATIBLE');

  let executing=false, principal=null, deliveryId='';
  const principalMatches=(player,job)=>
    executing===true&&player?.isValid===true&&
    player?.name===owner&&player?.id===principal?.id&&
    job?.gamertag===owner&&job?.id===deliveryId;
  const executor=createExecutor({
    isDispatchApproved:()=>executing===true,
    verifyLinkedPlayer:(player,job)=>principalMatches(player,job),
  });
  if(typeof executor?.execute!=='function'||typeof executor?.receiptStatus!=='function')
    return disabled('EXECUTOR_UNAVAILABLE');

  const getJob=(tier)=>{
    const t=TIERS[tier];
    return t?Object.freeze({
      contract:'netcraft.delivery.v1',
      id:t.orderId+'-0',orderId:t.orderId,
      gamertag:owner,kind:'vip',rankTag:t.rankTag,days:30,
    }):null;
  };
  function ensureLabRank(job){
    // The underlying Core remains the sole rank/expiry writer. Only create
    // missing ranks in this deliberately isolated clone, never overwrite any.
    const vip=Server.VIPSystem;
    const tier=job.rankTag.slice('ncbr:vip_'.length);
    const plan=TIERS[tier];
    if(!plan)return false;
    if(!vip.vipRanks.get(job.rankTag)){
      vip.vipRanks.set(job.rankTag,{
        name:plan.name,displayName:'VIP '+plan.name,
        defaultDays:30,order:-200000,
        features:{effects:false,pet:false},
      });
    }
    if(!Server.Ranks.getRank(job.rankTag)){
      Server.Ranks.createRank(job.rankTag,{
        displayName:'VIP '+plan.name,order:-200000,
        permissions:{},adminPermissions:{},landPermissions:{},
        chestShopPermissions:{},hideRanks:false,
      });
    }
    return !!vip.vipRanks.get(job.rankTag)&&!!Server.Ranks.getRank(job.rankTag);
  }

  function handle(event){
    if(event?.id!=='ncbrlab:vip_apply'&&event?.id!=='ncbrlab:vip_status')return;
    // Only an actual admin player in the single configured TEST account.
    // Console and spoofed browser input CANNOT trigger a grant.
    const player=event.sourceEntity;
    if(player?.typeId!=='minecraft:player'||player?.isValid!==true||
       player?.name!==owner||!player.hasTag?.('admin'))return;
    const tier=String(event.message||'').trim().toLowerCase();
    const job=getJob(tier);
    if(!job){player.sendMessage('§c[VIP CLONE] Use explorer, elite ou supreme.');return;}
    if(event.id==='ncbrlab:vip_status'){
      const saved=Server.VIPSystem.getVIP?.(owner,false);
      const state=executor.receiptStatus(job.id);
      player.sendMessage('§6[VIP CLONE] '+tier+' recibo='+state+
        ', atual='+(saved?.rankTag||'nenhum')+', expira='+(saved?.expiresAt||'n/a'));
      return;
    }
    if(executing){player.sendMessage('§c[VIP CLONE] Teste ocupado.');return;}
    if(executor.receiptStatus(job.id)!=='none'){
      player.sendMessage('§e[VIP CLONE] '+tier+' recibo='+executor.receiptStatus(job.id)+
        ' (não concede novamente).');return;
    }
    // Temporary release and identity callbacks exist ONLY while the local
    // synthetic job is executed. They never enable the commercial poller.
    const oldAuth=Server.DeliveryAuthorization;
    const oldIdentity=Server.DeliveryIdentity;
    let status='manual_review';
    try{
      if(!ensureLabRank(job)){status='vip_not_configured';return;}
      executing=true;principal=player;deliveryId=job.id;
      Server.DeliveryAuthorization={
        isReleaseApproved:()=>executing===true,
      };
      Server.DeliveryIdentity={
        isPlayerLinked:(p)=>p?.id===principal?.id&&p?.name===owner,
        verifyLinkedPlayer:(p,j)=>principalMatches(p,j),
      };
      status=executor.execute(job)?.status||'manual_review';
    }catch{status='manual_review';}
    finally{
      executing=false;principal=null;deliveryId='';
      if(oldAuth===undefined)delete Server.DeliveryAuthorization;
      else Server.DeliveryAuthorization=oldAuth;
      if(oldIdentity===undefined)delete Server.DeliveryIdentity;
      else Server.DeliveryIdentity=oldIdentity;
      console.warn(LOG+' tier='+tier+' result='+status+' commercial=OFF');
      player.sendMessage('§6[VIP CLONE] '+tier+' resultado='+status+
        ' (teste local isolado, sem Pix).');
    }
  }
  system.afterEvents.scriptEventReceive.subscribe(handle);
  console.warn(LOG+' READY_SYNTHETIC_ONLY commercial=OFF, gamertag='+owner);
  return Object.freeze({enabled:true,getJob,handle});
}
