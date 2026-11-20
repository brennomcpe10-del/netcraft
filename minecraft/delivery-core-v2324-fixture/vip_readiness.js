// NetCraftCore v2.3.25 LAB OFF: read-only readiness check.
// No sales, network access, queue polling, command handler or reward grant.
// Intended to run ONLY after Essentials has initialized on a cloned BDS.
const EXPECTED=Object.freeze([
  Object.freeze({tier:'explorer',tag:'ncbr:vip_explorer',name:'Explorer'}),
  Object.freeze({tier:'elite',tag:'ncbr:vip_elite',name:'Elite'}),
  Object.freeze({tier:'supreme',tag:'ncbr:vip_supreme',name:'Supreme'}),
]);
const norm=value=>String(value??'').trim().toLowerCase();
export function inspectNetCraftVipReadiness(Server,world){
  const vip=Server?.VIPSystem;
  const status=Server?.DeliveryIntegration?.getStatus?.();
  const off=!!status && status.mode==='LAB_OFF' &&
    status.dispatchEnabled===false && status.realPaymentsEnabled===false &&
    status.networkEnabled===false && status.deliveryEnabled===false;
  const ranks=EXPECTED.map(({tier,tag,name})=>{
    let rank;
    try{rank=vip?.vipRanks?.get?.(tag)}catch{}
    const exists=!!rank && typeof rank==='object';
    return Object.freeze({tier,tag,
      status:!exists?'missing':norm(rank.name)!==norm(name)?'name_mismatch':'configured'});
  });
  const required={
    getVip:typeof vip?.getVIP==='function',
    grantMethod:typeof vip?.grantDeliveryVIPLab==='function',
    durableVipStore:typeof vip?.vipPlayers?.flushNow==='function',
    dynamicProperties:typeof world?.getDynamicProperty==='function'&&
      typeof world?.setDynamicProperty==='function',
  };
  return Object.freeze({
    mode:'READ_ONLY_LAB_OFF',
    off,
    ranks:Object.freeze(ranks),
    api:Object.freeze(required),
    ranksConfigured:ranks.every(x=>x.status==='configured'),
    // Critical: a server rank check is NOT a delivery or player-auth proof.
    eligibleForRealDispatch:false,
    identityBindingVerified:false,
    signedTransportInstalled:false,
  });
}
export function reportNetCraftVipReadiness(Server,world,log=console.warn){
  // Console output contains only static plan names and feature booleans.
  // Never print gamertags, player IDs, payment IDs, secrets or buyer data.
  let result;
  try{result=inspectNetCraftVipReadiness(Server,world)}
  catch{log('[NCBR DELIVERY LAB] PREFLIGHT_ERROR_FAIL_CLOSED');return null}
  if(!result.off){
    log('[NCBR DELIVERY LAB] OFF_GUARD_MISSING_DO_NOT_USE');
    return result;
  }
  for(const rank of result.ranks)
    log('[NCBR DELIVERY LAB] VIP_'+rank.tier.toUpperCase()+'_'+rank.status.toUpperCase());
  for(const [key,ok] of Object.entries(result.api))
    if(!ok)log('[NCBR DELIVERY LAB] API_'+key.toUpperCase()+'_UNAVAILABLE');
  log('[NCBR DELIVERY LAB] PRECHECK_'+
    (result.ranksConfigured&&Object.values(result.api).every(Boolean)?'RANKS_READY':'BLOCKED')+
    '_DISPATCH_OFF_IDENTITY_OFF_NETWORK_OFF');
  return result;
}
