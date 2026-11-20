// NetCraft Delivery v0.3.1 — isolated BDS clone-only Core executor.
// TEST outbox only. No payment verification or outbound network calls here.
const VALID_ID=/^[a-f0-9]{64}-(0|[1-9]\d{0,2})$/;
const VALID_NAME=/^[A-Za-z0-9_ ]{1,32}$/;
const RECEIPT_PREFIX='ncbr:delivery_lab_v031:';
const MAX_TOTAL=2304;
function getReceipt(world,id) {
  try {
    const raw=world.getDynamicProperty(RECEIPT_PREFIX+id);
    if(typeof raw!=='string')return 'none';
    const parsed=JSON.parse(raw);
    return parsed?.state==='applied'?'applied':'started';
  }catch{return 'started';}
}
export function createVerifiedCoreLabEngine({world,ItemStack,Server}){
  const receiptStatus=id=>VALID_ID.test(id||'')?getReceipt(world,id):'started';
  function validate(job){
    if(!job||typeof job!=='object'||Array.isArray(job)||
       job.contract!=='netcraft.delivery.v1'||!VALID_ID.test(job.id||'')||
       job.orderId!==job.id.split('-')[0]||!VALID_NAME.test(job.gamertag||'')||
       job.gamertag.trim()!==job.gamertag)return 'invalid_job';
    if(job.kind==='vip'){
      if(job.rankTag!=='ncbr:vip_explorer'||job.days!==30||'items' in job)
        return 'vip_not_configured';
      return null;
    }
    if(job.kind!=='items'||'rankTag' in job||'days' in job||
       !Array.isArray(job.items)||!job.items.length||job.items.length>36)
      return 'invalid_item';
    let total=0;const ids=new Set();
    for(const it of job.items){
      if(!it||typeof it!=='object'||Array.isArray(it)||
         Object.keys(it).some(k=>!['itemId','quantity'].includes(k))||
         !/^minecraft:[a-z0-9_]+$/.test(it.itemId||'')||
         !Number.isSafeInteger(it.quantity)||it.quantity<1||it.quantity>MAX_TOTAL||
         ids.has(it.itemId))return 'invalid_item';
      ids.add(it.itemId);total+=it.quantity;if(total>MAX_TOTAL)return 'invalid_item';
    }
    return null;
  }
  function execute(job){
    const err=validate(job);if(err)return {status:err};
    const status=receiptStatus(job.id);
    if(status==='applied')return {status:'already_applied'};
    if(status!=='none')return {status:'manual_review'};
    const player=world.getAllPlayers().find(p=>p?.isValid&&p.name===job.gamertag);
    if(!player)return {status:'player_offline'};
    const key=RECEIPT_PREFIX+job.id;
    if(job.kind==='vip'){
      const vip=Server?.VIPSystem;
      if(!vip?.vipRanks?.get('ncbr:vip_explorer')||
         typeof vip.grantDeliveryVIPLab!=='function')return {status:'vip_not_configured'};
      const current=vip.getVIP(player.name,false);
      if(current&&current.rankTag!=='ncbr:vip_explorer')return {status:'vip_not_configured'};
      try{
        world.setDynamicProperty(key,JSON.stringify({state:'started',kind:'vip'}));
        if(vip.grantDeliveryVIPLab(player.name,'ncbr:vip_explorer',30)!=='applied')
          return {status:'manual_review'};
        world.setDynamicProperty(key,JSON.stringify({state:'applied',kind:'vip'}));
        return {status:'applied'};
      }catch{return {status:'manual_review'};}
    }
    let container;
    try{container=player.getComponent('minecraft:inventory')?.container;}
    catch{return {status:'inventory_unavailable'};}
    if(!container?.isValid)return {status:'inventory_unavailable'};
    const stacks=[];
    try{
      for(const it of job.items){
        const proto=new ItemStack(it.itemId,1);
        const max=proto.maxAmount;
        if(!Number.isSafeInteger(max)||max<1||max>64)return {status:'invalid_item'};
        for(let remain=it.quantity;remain>0;remain-=max)
          stacks.push(new ItemStack(it.itemId,Math.min(remain,max)));
      }
      if(container.emptySlotsCount<stacks.length)return {status:'inventory_full'};
    }catch{return {status:'inventory_unavailable'};}
    try{
      world.setDynamicProperty(key,JSON.stringify({state:'started',kind:'items'}));
      for(const stack of stacks){
        const leftover=container.addItem(stack);
        if(leftover&&Number(leftover.amount)>0)return {status:'manual_review'};
      }
      world.setDynamicProperty(key,JSON.stringify({state:'applied',kind:'items'}));
      return {status:'applied'};
    }catch{return {status:'manual_review'};}
  }
  return {execute,receiptStatus};
}
