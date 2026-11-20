// NetCraft Delivery / NetCraftCore 2.3.24: verified LAB executor library only.
// NOT imported by a live BDS request handler, command, scriptevent or timer.
// Real payments, Firebase, Cloudflare and any unverified player claims CANNOT
// invoke this library in this package. DO NOT bypass the OFF install gate.
const ID = /^[a-f0-9]{64}-(0|[1-9][0-9]{0,2})$/;
const NAME = /^[A-Za-z0-9_ ]{3,32}$/;
const REWARD_TAGS = new Set(['ncbr:vip_explorer','ncbr:vip_elite','ncbr:vip_supreme']);
const KEY = 'ncbr:verified_delivery_2321:';
function readReceipt(world,id){
  try {
    const raw=world.getDynamicProperty(KEY+id);
    if(raw===undefined)return 'none';
    const obj=typeof raw==='string'?JSON.parse(raw):null;
    return obj?.state==='applied'?'applied':'uncertain';
  }catch {return 'uncertain';}
}
export function validateDeliveryJob(job){
  if(!job || typeof job!=='object' || Array.isArray(job) ||
     job.contract!=='netcraft.delivery.v1'||!ID.test(job.id||'')||
     job.orderId !== job.id.split('-')[0]||
     !NAME.test(job.gamertag||'') || job.gamertag!==job.gamertag.trim())
    return 'invalid_job';
  const keys=job.kind==='vip'
    ?['contract','id','orderId','gamertag','kind','rankTag','days']
    :['contract','id','orderId','gamertag','kind','items'];
  if(Object.keys(job).some(k=>!keys.includes(k)) || Object.keys(job).length!==keys.length)
    return 'invalid_job';
  if(job.kind==='vip')return REWARD_TAGS.has(job.rankTag)&&job.days===30
    ?null:'vip_not_configured';
  if(job.kind!=='items'||!Array.isArray(job.items)||job.items.length<1||job.items.length>36)
    return 'invalid_item';
  let total=0;const seen=new Set();
  for(const item of job.items){
    if(!item||typeof item!=='object'||Array.isArray(item)||
       Object.keys(item).length!==2||Object.keys(item).some(k=>!['itemId','quantity'].includes(k))||
       !/^minecraft:[a-z0-9_]+$/.test(item.itemId||'')||
       !Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>2304||seen.has(item.itemId))
      return 'invalid_item';
    seen.add(item.itemId);total+=item.quantity;
  }
  return total<=2304?null:'invalid_item';
}
export function createVerifiedLabExecutor({world,Server,ItemStack,verifyLinkedPlayer,isOfflineClone}){
  // In production, no code constructs this object. Offline clone simulation
  // must opt in with an internal, private, trusted callback (not request data).
  const receiptStatus=id=>ID.test(id||'')?readReceipt(world,id):'uncertain';
  function execute(job){
    if (typeof isOfflineClone!=='function' || isOfflineClone()!==true)
      return {status:'disabled'};
    const problem=validateDeliveryJob(job);
    if(problem)return {status:problem};
    const prior=receiptStatus(job.id);
    if(prior==='applied')return {status:'already_applied'};
    if(prior!=='none')return {status:'manual_review'};
    let players;
    try {players=world.getAllPlayers().filter(p=>p?.isValid===true&&p.name===job.gamertag);}
    catch {return {status:'player_offline'};}
    if(players.length!==1)return {status:'player_offline'};
    const player=players[0];
    if(typeof verifyLinkedPlayer!=='function')return {status:'identity_unverified'};
    try {if(verifyLinkedPlayer(player,job)!==true)return {status:'identity_unverified'};}
    catch {return {status:'identity_unverified'};}
    // No persistent receipt is written for deterministic failures that are
    // explicitly safe to retry (offline, missing rank, inventory full).
    if(job.kind==='vip'){
      const vip=Server?.VIPSystem;
      if(!vip?.vipRanks?.get?.(job.rankTag)||typeof vip.grantDeliveryVIPLab!=='function')
        return {status:'vip_not_configured'};
      let current;
      try {current=vip.getVIP(player.name,false);}
      catch {return {status:'vip_not_configured'};}
      if(current?.source==='creator'||current?.rankTag&&current.rankTag!==job.rankTag)
        return {status:'vip_upgrade_review_required'};
      // Write-ahead BEFORE any VIP update. A crash after this point requires
      // manual reconciliation and MUST NOT replay the transaction.
      try {
        world.setDynamicProperty(KEY+job.id,JSON.stringify({state:'started',kind:'vip'}));
        if(vip.grantDeliveryVIPLab(player.name,job.rankTag,job.days)!=='applied')
          return {status:'manual_review'};
        world.setDynamicProperty(KEY+job.id,JSON.stringify({state:'applied',kind:'vip'}));
        return {status:'applied'};
      }catch{return {status:'manual_review'};}
    }
    let container;
    try {container=player.getComponent('minecraft:inventory')?.container;}
    catch{return {status:'inventory_unavailable'};}
    if(!container?.isValid)return {status:'inventory_unavailable'};
    const stacks=[];
    try{
      for(const item of job.items){
        const probe=new ItemStack(item.itemId,1);
        if(!Number.isSafeInteger(probe.maxAmount)||probe.maxAmount<1||probe.maxAmount>64)
          return {status:'invalid_item'};
        for(let remain=item.quantity;remain>0;remain-=probe.maxAmount)
          stacks.push(new ItemStack(item.itemId,Math.min(remain,probe.maxAmount)));
      }
      // Conservative: do not assume empty capacity from existing stacks.
      if(container.emptySlotsCount<stacks.length)return {status:'inventory_full'};
    }catch{return {status:'invalid_item'};}
    try{
      world.setDynamicProperty(KEY+job.id,JSON.stringify({state:'started',kind:'items'}));
      for(const stack of stacks){
        const leftover=container.addItem(stack);
        if(leftover&&Number(leftover.amount)>0)return {status:'manual_review'};
      }
      world.setDynamicProperty(KEY+job.id,JSON.stringify({state:'applied',kind:'items'}));
      return {status:'applied'};
    }catch{return {status:'manual_review'};}
  }
  return Object.freeze({execute,receiptStatus});
}
