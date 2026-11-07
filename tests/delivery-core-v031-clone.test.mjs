import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createVerifiedCoreLabEngine} from '../minecraft/delivery-v031-core-lab/core_delivery_lab_v031.js';
const order='a'.repeat(64);
function fixture(free=3,rankEnabled=true){
 const log=new Map(),inventory=[];let grantCount=0;let expiry=0;
 const player={isValid:true,name:'Lab Tester',getComponent:()=>({container:{
  isValid:true,get emptySlotsCount(){return free-inventory.length;},
  addItem:item=>{inventory.push(item);return undefined;}}})};
 const world={getAllPlayers:()=>[player],getDynamicProperty:k=>log.get(k),setDynamicProperty:(k,v)=>log.set(k,v)};
 class ItemStack{constructor(id,qty){if(id!=='minecraft:iron_ingot'&&id!=='minecraft:diamond')throw Error('bad');
 this.typeId=id;this.amount=qty;this.maxAmount=64;}}
 const Server={VIPSystem:{vipRanks:{get:()=>rankEnabled?{}:null},
  getVIP:()=>expiry>Date.now()?{rankTag:'ncbr:vip_explorer'}:null,
  grantDeliveryVIPLab:(_name,_rank,days)=>{grantCount++;expiry=Math.max(Date.now(),expiry)+days*86400000;return 'applied';}}};
 const run=()=>createVerifiedCoreLabEngine({world,ItemStack,Server});
 const base={contract:'netcraft.delivery.v1',orderId:order,gamertag:'Lab Tester'};
 const kit={...base,id:order+'-0',kind:'items',items:[{itemId:'minecraft:diamond',quantity:3},{itemId:'minecraft:iron_ingot',quantity:6}]};
 const vip={...base,id:order+'-1',kind:'vip',rankTag:'ncbr:vip_explorer',days:30};
 return {run,kit,vip,inventory,log,get grantCount(){return grantCount;},get expiry(){return expiry;}};
}
test('kit receipt survives restart and prevents second grant',()=>{
 const x=fixture();assert.equal(x.run().execute(x.kit).status,'applied');
 assert.equal(x.run().execute(x.kit).status,'already_applied');assert.equal(x.inventory.length,2);
});
test('inventory full is a pre-receipt safe hold',()=>{
 const x=fixture(1);assert.equal(x.run().execute(x.kit).status,'inventory_full');
 assert.equal(x.run().receiptStatus(x.kit.id),'none');assert.equal(x.inventory.length,0);
});
test('Explorer starts 30-day term and does not renew a repeated ID',()=>{
 const x=fixture();assert.equal(x.run().execute(x.vip).status,'applied');
 assert.equal(x.grantCount,1);assert.ok(x.expiry>Date.now()+29*86400000);
 assert.equal(x.run().execute(x.vip).status,'already_applied');assert.equal(x.grantCount,1);
});
test('ambiguous write-ahead receipt is quarantined',()=>{
 const x=fixture();x.log.set('ncbr:delivery_lab_v031:'+x.kit.id,JSON.stringify({state:'started'}));
 assert.equal(x.run().execute(x.kit).status,'manual_review');assert.equal(x.inventory.length,0);
});
test('invalid jobs and missing rank fail closed without receipt',()=>{
 const x=fixture(3,false);
 assert.equal(x.run().execute(x.vip).status,'vip_not_configured');
 for(const payload of [{...x.kit,orderId:'b'.repeat(64)},
   {...x.kit,items:[{itemId:'minecraft:unknown',quantity:1}]},
   {...x.vip,rankTag:'admin'}]){
   assert.notEqual(x.run().execute(payload).status,'applied');
 }
 assert.equal(x.log.size,0);
});
