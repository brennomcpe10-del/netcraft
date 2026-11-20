/**
 * NetCraftBR 2.3.76 commercial delivery preflight — STRICTLY READ-ONLY.
 * Does not fetch network resources, access SecretString, issue link codes,
 * create/modify receipts, grant ranks, schedule a pump or enable commerce.
 * Diagnostic commands are restricted to a currently connected admin player.
 */
const VERSION='2.3.76';
const REQUIRED_RANKS=Object.freeze([
  'ncbr:vip_explorer','ncbr:vip_elite','ncbr:vip_supreme',
]);
const isAdminPlayer=p=>{
  try{return p?.isValid===true&&p.typeId==='minecraft:player'&&
    p.hasTag?.('admin')===true;}
  catch{return false;}
};

export function commercialLabPreflight(Server,world){
  let status;
  try{status=Server?.DeliveryCommercial?.getStatus?.()}catch{}
  const safelyLocked=status?.mode==='LAB_OFF'&&
    status.dispatchEnabled===false&&status.realPaymentsEnabled===false&&
    status.networkEnabled===false&&status.deliveryEnabled===false;
  const vip=Server?.VIPSystem;
  let ranksReady=[];
  for(const tag of REQUIRED_RANKS){
    let ready=false;
    try{ready=!!vip?.vipRanks?.get?.(tag)&&!!Server?.Ranks?.getRank?.(tag)}catch{}
    ranksReady.push(ready);
  }
  const checks=Object.freeze({
    commerceHardOff:safelyLocked,
    commandLinkBridgeReady:typeof Server?.DeliveryLink?.linkPurchase==='function',
    vipWriteInterfaceReady:typeof vip?.grantDeliveryVIPLab==='function',
    persistentReceiptApiReady:typeof world?.getDynamicProperty==='function'&&
      typeof world?.setDynamicProperty==='function',
    rankExplorerReady:ranksReady[0],rankEliteReady:ranksReady[1],
    rankSupremeReady:ranksReady[2],
  });
  // Do not return a deploy/release decision. A green preflight is NOT proof
  // of payment validation, gateway configuration, production readiness, etc.
  return Object.freeze({version:VERSION,mode:'LAB_OFF_DIAGNOSTIC',
    canCharge:false,canGrantCommercial:false,checks});
}

export function installCommercialLabPreflight({Server,world,system,
  log=()=>{}}){
  const snapshot=()=>commercialLabPreflight(Server,world);
  const eventId='ncbr:commercial_check_v1';
  try{
    system?.afterEvents?.scriptEventReceive?.subscribe?.(event=>{
      if(event?.id!==eventId)return;
      const player=event.sourceEntity;
      if(!isAdminPlayer(player))return;
      const data=snapshot();
      const checks=Object.entries(data.checks).map(([key,ready])=>
        key+'='+(ready?'OK':'PENDENTE')).join(', ');
      try{player.sendMessage('§6[NetCraft Commerce] §fv'+data.version+
        ' LAB_OFF — sem Pix real, sem VIP comercial.');
        player.sendMessage('§7'+checks);
      }catch{}
      // No secret, voucher, gamertag or order identifier in console output.
      try{log('[NCBR COMMERCE '+VERSION+'] PREFLIGHT_READ_ONLY '+checks)}catch{}
    });
  }catch{}
  const result=snapshot();
  const critical=result.checks.commerceHardOff?'LOCK_CONFIRMED':'LOCK_UNVERIFIED';
  try{log('[NCBR COMMERCE '+VERSION+'] '+critical+
    ' PREFLIGHT_READY_NO_PAYMENTS_NO_GRANTS')}catch{}
  return Object.freeze({snapshot,eventId});
}
