// NetCraft Delivery 0.4.0 — CLONE-ONLY executor integration adapter.
// Does not open a URL, read credentials or run automatically. NEVER installed
// into the production NetCraftCore without a reviewed BDS release.
// The verified bridge invokes execute() only after payment+lease verification.
const ID=/^[a-f0-9]{64}-(0|[1-9][0-9]{0,2})$/;
const NAME=/^[A-Za-z0-9_ ]{3,32}$/;
const PREFIX="ncbr:delivery_clone_v040:";
const RANKS=new Set(["ncbr:vip_explorer","ncbr:vip_elite","ncbr:vip_supreme"]);
function receipt(world,id){
 try{
  const raw=world.getDynamicProperty(PREFIX+id);
  if(raw===undefined)return "none";
  if(typeof raw!=="string")return "started";
  const value=JSON.parse(raw);
  return value?.state==="applied"?"applied":"started";
 }catch{return "started";}
}
function validate(job){
 if(!job||typeof job!=="object"||Array.isArray(job)||
    job.contract!=="netcraft.delivery.v1"||!ID.test(job.id||"")||
    job.orderId!==job.id.split("-")[0]||
    !NAME.test(job.gamertag||"")||job.gamertag!==job.gamertag.trim())
   return "invalid_job";
 const allowed=job.kind==="vip"?
   ["contract","id","orderId","gamertag","kind","rankTag","days"]:
   ["contract","id","orderId","gamertag","kind","items"];
 if(Object.keys(job).some(k=>!allowed.includes(k)))return "invalid_job";
 if(job.kind==="vip")return RANKS.has(job.rankTag)&&job.days===30?
    null:"vip_not_configured";
 if(job.kind!=="items"||!Array.isArray(job.items)||!job.items.length||
    job.items.length>36)return "invalid_item";
 let total=0;const seen=new Set();
 for(const item of job.items){
  if(!item||typeof item!=="object"||Array.isArray(item)||
     Object.keys(item).some(k=>!["itemId","quantity"].includes(k))||
     !/^minecraft:[a-z0-9_]+$/.test(item.itemId||"")||
     !Number.isSafeInteger(item.quantity)||item.quantity<1||
     item.quantity>2304||seen.has(item.itemId))return "invalid_item";
  seen.add(item.itemId);total+=item.quantity;
 }
 return total<=2304?null:"invalid_item";
}
export function createCoreDeliveryCloneEngine({
  world,ItemStack,Server,verifyLinkedPlayer,
}) {
 // The binding is a trusted server-owned check, not a flag in the order.
 // Without it, the executor CANNOT grant a paid reward to an arbitrary name.
 const receiptStatus=(id)=>ID.test(id||"")?receipt(world,id):"started";
 function execute(job){
  const problem=validate(job);
  if(problem)return {status:problem};
  const previous=receiptStatus(job.id);
  if(previous==="applied")return {status:"already_applied"};
  if(previous!=="none")return {status:"manual_review"};
  const matches=world.getAllPlayers().filter(p=>p?.isValid===true&&p.name===job.gamertag);
  if(matches.length!==1)return {status:"player_offline"};
  const player=matches[0];
  // The official Core must supply a verified account binding. Player name
  // alone is NOT sufficient authority to transfer a purchased reward.
  if(typeof verifyLinkedPlayer!=="function")return {status:"identity_unverified"};
  try{
   if(verifyLinkedPlayer(player,job)!==true)return {status:"identity_unverified"};
  }catch{return {status:"identity_unverified"};}
  const key=PREFIX+job.id;
  if(job.kind==="vip"){
   const system=Server?.VIPSystem;
   if(!system?.vipRanks?.get(job.rankTag)||
      typeof system.getVIP!=="function"||
      typeof system.grantDeliveryVIPLab!=="function")
    return {status:"vip_not_configured"};
   let current;
   try{current=system.getVIP(player.name,false);}
   catch{return {status:"vip_not_configured"};}
   // Do not silently replace another VIP tier or creator rank. An explicit
   // upgrade/downgrade policy needs real NetCraftCore approval.
   if(current?.rankTag&&current.rankTag!==job.rankTag)
    return {status:"vip_upgrade_review_required"};
   try{
    world.setDynamicProperty(key,JSON.stringify({state:"started",kind:"vip"}));
    // The real Core writer checks the server-owned identity callbacks
    // against the exact delivery job; do not omit that fourth argument.
    if(system.grantDeliveryVIPLab(player.name,job.rankTag,job.days,job)!=="applied")
      return {status:"manual_review"};
    world.setDynamicProperty(key,JSON.stringify({state:"applied",kind:"vip"}));
    return {status:"applied"};
   }catch{return {status:"manual_review"};}
  }
  let inventory;
  try{inventory=player.getComponent("minecraft:inventory")?.container;}
  catch{return {status:"inventory_unavailable"};}
  if(!inventory?.isValid)return {status:"inventory_unavailable"};
  const stacks=[];
  try{
   for(const item of job.items){
    const sample=new ItemStack(item.itemId,1);
    if(!Number.isSafeInteger(sample.maxAmount)||sample.maxAmount<1||
       sample.maxAmount>64)return {status:"invalid_item"};
    for(let remain=item.quantity;remain>0;remain-=sample.maxAmount)
      stacks.push(new ItemStack(item.itemId,Math.min(remain,sample.maxAmount)));
   }
   // Conservative: require completely free slots, never guess stacking room.
   if(inventory.emptySlotsCount<stacks.length)return {status:"inventory_full"};
  }catch{return {status:"invalid_item"};}
  try{
   world.setDynamicProperty(key,JSON.stringify({state:"started",kind:"items"}));
   for(const stack of stacks){
    const leftover=inventory.addItem(stack);
    if(leftover&&Number(leftover.amount)>0)return {status:"manual_review"};
   }
   world.setDynamicProperty(key,JSON.stringify({state:"applied",kind:"items"}));
   return {status:"applied"};
  }catch{return {status:"manual_review"};}
 }
 return {execute,receiptStatus,validate};
}
