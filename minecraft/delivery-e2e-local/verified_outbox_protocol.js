// BDS-only validation for independently verified local Pix emulator rewards.
// This file has no side effects and must never be installed in Production.
const allowedFields=new Set(['contract','labFixture','id','orderId','gamertag','kind','items','rankTag','days']);
const validId=/^[a-f0-9]{64}-(0|[1-9]\d{0,2})$/;
export function validateVerifiedOutboxResponse(response,expectedPlayer) {
 if(!response||response.simulation!==true||
    response.environment!=='verified_pix_emulator'||
    response.dispatchEnabled!==false||!Array.isArray(response.deliveries)||
    response.deliveries.length>4 || !/^[A-Za-z0-9_ ]{1,32}$/.test(expectedPlayer||''))
   return null;
 const seen=new Set(),jobs=[];
 for(const x of response.deliveries){
  if(!x||typeof x!=='object'||Array.isArray(x)||
     Object.keys(x).some(k=>!allowedFields.has(k))||
     x.labFixture!==true||x.contract!=='netcraft.delivery.v1'||
     x.gamertag!==expectedPlayer||!validId.test(x.id||'')||
     x.orderId!==x.id.split('-')[0]||seen.has(x.id))return null;
  seen.add(x.id);
  if(x.kind==='vip'){
   if(x.rankTag!=='ncbr:vip_explorer'||x.days!==30||'items' in x)return null;
   jobs.push({contract:'netcraft.delivery.v1',id:x.id,
     orderId:x.orderId,gamertag:x.gamertag,
     kind:'vip',rankTag:'ncbr:vip_explorer',days:30});
  }else if(x.kind==='items'){
   if('rankTag' in x||'days' in x||!Array.isArray(x.items)||
      x.items.length<1||x.items.length>36)return null;
   const ids=new Set();
   let total=0;
   const items=[];
   for(const it of x.items){
    if(!it||typeof it!=='object'||Array.isArray(it)||
       Object.keys(it).some(k=>!['itemId','quantity'].includes(k))||
       typeof it.itemId!=='string'||!/^minecraft:[a-z0-9_]+$/.test(it.itemId)||
       !Number.isSafeInteger(it.quantity)||it.quantity<1||it.quantity>2304||
       ids.has(it.itemId))return null;
    ids.add(it.itemId);total+=it.quantity;
    if(total>2304)return null;
    items.push({itemId:it.itemId,quantity:it.quantity});
   }
   jobs.push({contract:'netcraft.delivery.v1',id:x.id,
     orderId:x.orderId,gamertag:x.gamertag,kind:'items',items});
  }else return null;
 }
 return jobs;
}
