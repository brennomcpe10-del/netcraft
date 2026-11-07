import { test } from 'node:test';import assert from 'node:assert/strict';
import { validateLabResponse, isAckableResult, E2E_LAB_ITEM_ID, E2E_LAB_ORDER_ID, E2E_LAB_VIP_ID } from './bridge_protocol.js';
const gamertag='Lab Tester';const good={contract:'netcraft.delivery.v1',labFixture:true,
  orderId:E2E_LAB_ORDER_ID,id:E2E_LAB_ITEM_ID,gamertag,kind:'items',items:[{itemId:'minecraft:iron_ingot',quantity:2}]};
const wrap=jobs=>({simulation:true,environment:'synthetic_local',dispatchEnabled:false,deliveries:jobs});
test('fixed localhost synthetic item granted via validated Core job only',()=>{
 const result=validateLabResponse(wrap([good]),gamertag);
 assert.deepEqual(result,[{contract:'netcraft.delivery.v1',id:E2E_LAB_ITEM_ID,orderId:E2E_LAB_ORDER_ID,
  gamertag,kind:'items',items:[{itemId:'minecraft:iron_ingot',quantity:2}]}]);
 assert.equal(isAckableResult({status:'applied'}),true);
 assert.equal(isAckableResult({status:'already_applied'}),true);
 for(const status of ['player_offline','inventory_full','manual_review','storage_error','invalid_job'])
  assert.equal(isAckableResult({status}),false);
});
test('untrusted/production jobs or wrong targets are not executed',()=>{
 for(const bad of [
  wrap([{...good,labFixture:false}]), wrap([{...good,gamertag:'Other'}]),
  wrap([{...good,items:[{itemId:'minecraft:diamond',quantity:64}]}]),
  wrap([{...good,id:E2E_LAB_VIP_ID}]), wrap([good,good]),
  wrap([good,good,good]), {...wrap([good]),dispatchEnabled:true},
  {...wrap([good]),simulation:false},{...wrap([good]),environment:'production'},
  wrap([{...good,orderId:'a'.repeat(64)}]),
 ]) assert.equal(validateLabResponse(bad,gamertag),null);
});
test('VIP test job may only name existing Core-defined tag with fixed single day',()=>{
 const vip={...good,id:E2E_LAB_VIP_ID,kind:'vip',rankTag:'ncbr:vip_explorer',days:1};
 delete vip.items;
 assert.deepEqual(validateLabResponse(wrap([vip]),gamertag)?.[0]?.rankTag,'ncbr:vip_explorer');
 for(const change of [{rankTag:'admin'},{days:3650},{rankTag:'ncbr:vip_explorer;op @p'}])
  assert.equal(validateLabResponse(wrap([{...vip,...change}]),gamertag),null);
});

test('VIP renewal and multi-item kit use unique allowlisted receipts only',()=>{
 const common={...good,kind:'vip',id:E2E_LAB_VIP_ID,rankTag:'ncbr:vip_explorer',days:1};
 delete common.items;
 const renewal={...common,id:'d'.repeat(64)+'-3'};
 const kit={...good,id:'d'.repeat(64)+'-2',
   items:[{itemId:'minecraft:diamond',quantity:3},{itemId:'minecraft:iron_ingot',quantity:6}]};
 const result=validateLabResponse(wrap([common,renewal,kit]),gamertag);
 assert.deepEqual(result.map(x=>x.id),[common.id,renewal.id,kit.id]);
 assert.equal(result[2].items.length,2);
 for(const bad of [
   {...common,rankTag:'ncbr:vip_supreme'},
   {...renewal,days:30},
   {...kit,items:[{itemId:'minecraft:diamond',quantity:64},{itemId:'minecraft:iron_ingot',quantity:6}]},
   {...kit,items:[{itemId:'minecraft:diamond',quantity:3},{itemId:'minecraft:iron_ingot',quantity:6}],command:'op'},
 ]) assert.equal(validateLabResponse(wrap([bad]),gamertag),null);
});
