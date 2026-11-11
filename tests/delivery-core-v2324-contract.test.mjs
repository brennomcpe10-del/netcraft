// SITE -> REAL NETCRAFTCORE 2.3.24 CONTRACT GATE (LAB OFF).
// Pure Node mocks; no BDS, gateway, provider API, real payment or grant.
// The fixture is byte-for-byte the Core executor, NOT the older v0.4 clone.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import {makeRewardRegistry, mappedDelivery} from '../server/delivery/verifiedRewardRegistry.ts';
import {createVerifiedLabExecutor} from '../minecraft/delivery-core-v2324-fixture/verified_executor.js';
const hash='f72b5bfef4fbc96767f43a6817275e37cdb0fe77741701bf3ff2519fb8238867';
const fixture=new URL('../minecraft/delivery-core-v2324-fixture/verified_executor.js',import.meta.url);
const ID=n=>crypto.createHash('sha256').update('NCBR-LAB-ORDER-'+n).digest('hex');
const name='Halzin5212',tiers=['explorer','elite','supreme'];
const kit={kind:'items',productId:'kit-lab-guarded',items:[
  {itemId:'minecraft:diamond',quantity:3},{itemId:'minecraft:iron_ingot',quantity:6}]};
const registry=makeRewardRegistry([kit,...tiers.map(tier=>({
  kind:'vip',productId:'vip-lab-'+tier,tier,rankTag:'ncbr:vip_'+tier,days:30,
  duration:'30 dias'}))]);
const kitLine=(quantity=1)=>({productType:'product',productId:kit.productId,
  quantity,reward:{version:1,items:kit.items.map(x=>({...x}))}});
const vipLine=t=>({productType:'vip',productId:'vip-lab-'+t,quantity:1,duration:'30 dias'});
const compile=(label,index,line,gamertag=name)=>mappedDelivery({
  orderId:ID(label),index,gamertag,line,registry});
function lab({playerName=name,online=true,slots=36,linked=true,throwAt=0,
  ranks=true,previousTier=null}={}){
  const props=new Map(),items=[],grants=[];
  const player={name:playerName,id:'xuid-test-linked',isValid:true,
    getComponent:()=>({container:{isValid:true,
      get emptySlotsCount(){return slots-items.length;},
      addItem(x){if(throwAt===items.length+1)throw Error('mock write failed');
        items.push(x);return undefined;}}})};
  const world={getAllPlayers:()=>online?[player]:[],
    getDynamicProperty:k=>props.get(k),setDynamicProperty:(k,v)=>props.set(k,v)};
  class ItemStack{
    constructor(typeId,amount){if(!['minecraft:diamond','minecraft:iron_ingot'].includes(typeId))
      throw Error('invalid mock item');
      this.typeId=typeId;this.amount=amount;this.maxAmount=64;}
  }
  const Server={VIPSystem:{vipRanks:new Map(ranks?tiers.map(t=>['ncbr:vip_'+t,{}]):[]),
    getVIP:()=>previousTier?{rankTag:previousTier}:null,
    grantDeliveryVIPLab:(n,rankTag,days)=>{
      grants.push({name:n,rankTag,days});previousTier=rankTag;return 'applied';}}};
  const engine=(offline=true)=>createVerifiedLabExecutor({world,ItemStack,Server,
    isOfflineClone:()=>offline,
    verifyLinkedPlayer:(p,j)=>linked&&p.id==='xuid-test-linked'&&p.name===j.gamertag});
  return {engine,props,items,grants};
}
test('Source hash matches official NetCraftCore v2.3.24 addon executor',()=>{
  assert.equal(crypto.createHash('sha256').update(readFileSync(fixture)).digest('hex'),hash);
});
test('Approved kit mapping -> Core grants once; reboot does not duplicate',()=>{
  const job=compile('kit',0,kitLine()),mc=lab();
  assert.equal(job.contract,'netcraft.delivery.v1');
  assert.equal(mc.engine().execute(job).status,'applied');
  assert.equal(mc.engine().execute(job).status,'already_applied');
  assert.equal(mc.items.length,2);
});
test('Kit quantity multiplication follows approved server-side rules',()=>{
  const job=compile('quantity',0,kitLine(2)),mc=lab();
  assert.deepEqual(job.items.map(x=>x.quantity),[6,12]);
  assert.equal(mc.engine().execute(job).status,'applied');
  assert.equal(mc.items.reduce((n,x)=>n+x.amount,0),18);
});
test('Unapproved storefront product cannot create a delivery',()=>{
  assert.throws(()=>compile('bad-product',0,{...kitLine(),productId:'unapproved'}),
    /unmapped_store_product/);
});
test('Storefront snapshot tampering cannot choose richer rewards',()=>{
  const bad=kitLine();bad.reward.items[0].quantity=99;
  assert.throws(()=>compile('tampered',0,bad),/kit_snapshot_registry_mismatch/);
});
test('All three VIP tiers are 30 days, and replay does not extend them',()=>{
  for(const tier of tiers){
    const job=compile('tier-'+tier,0,vipLine(tier)),mc=lab();
    assert.equal(job.rankTag,'ncbr:vip_'+tier);
    assert.equal(job.days,30);
    assert.equal(mc.engine().execute(job).status,'applied');
    assert.equal(mc.engine().execute(job).status,'already_applied');
    assert.equal(mc.grants.length,1);
  }
});
test('A distinct approved order may renew the same VIP tier once',()=>{
  const mc=lab(),a=compile('renew-a',0,vipLine('explorer')),
    b=compile('renew-b',0,vipLine('explorer'));
  assert.equal(mc.engine().execute(a).status,'applied');
  assert.equal(mc.engine().execute(a).status,'already_applied');
  assert.equal(mc.engine().execute(b).status,'applied');
  assert.equal(mc.grants.length,2);
});
test('Wrong VIP duration/type or quantity refused by server registry',()=>{
  assert.throws(()=>compile('days',0,{...vipLine('elite'),duration:'365 dias'}),
    /vip_product_or_duration_mismatch/);
  assert.throws(()=>compile('qty',0,{...vipLine('elite'),quantity:2}),
    /vip_product_or_duration_mismatch/);
});
test('Offline player causes no receipt or grant',()=>{
  const mc=lab({online:false});
  assert.equal(mc.engine().execute(compile('offline',0,kitLine())).status,'player_offline');
  assert.equal(mc.props.size,0);
});
test('Wrong player and unverified account both fail closed',()=>{
  const job=compile('wrong',0,vipLine('supreme'));
  for(const options of [{playerName:'DifferentPlayer'},{linked:false}]){
    const mc=lab(options),result=mc.engine().execute(job);
    assert.ok(['player_offline','identity_unverified'].includes(result.status));
    assert.equal(mc.props.size,0);
    assert.equal(mc.grants.length,0);
  }
});
test('Inventory full leaves no receipt, item or grant',()=>{
  const mc=lab({slots:0});
  assert.equal(mc.engine().execute(compile('full',0,kitLine())).status,'inventory_full');
  assert.equal(mc.props.size,0);assert.equal(mc.items.length,0);
});
test('Partial inventory insert results in permanent manual review on replay',()=>{
  const mc=lab({throwAt:2}),job=compile('partial',0,kitLine());
  assert.equal(mc.engine().execute(job).status,'manual_review');
  assert.equal(mc.engine().execute(job).status,'manual_review');
  assert.equal(mc.items.length,1);
});
test('Automatic VIP upgrade is refused without an approved policy',()=>{
  const mc=lab({previousTier:'ncbr:vip_elite'});
  assert.equal(mc.engine().execute(compile('upgrade',0,vipLine('supreme'))).status,
    'vip_upgrade_review_required');
  assert.equal(mc.props.size,0);
});
test('Unconfigured VIP tier cannot be invented by a site order',()=>{
  const mc=lab({ranks:false});
  assert.equal(mc.engine().execute(compile('unconfigured',0,vipLine('explorer'))).status,
    'vip_not_configured');
  assert.equal(mc.grants.length,0);
});
test('Live execution is disabled without the trusted OFFLINE clone guard',()=>{
  const mc=lab();
  assert.equal(mc.engine(false).execute(compile('closed',0,kitLine())).status,'disabled');
  assert.equal(mc.props.size,0);
});
