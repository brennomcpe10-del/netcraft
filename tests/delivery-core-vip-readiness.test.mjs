// Readiness-only diagnostics on a cloned NetCraftCore. Absolutely no grants.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectNetCraftVipReadiness,reportNetCraftVipReadiness,
} from '../minecraft/delivery-core-v2324-fixture/vip_readiness.js';

const tiers=['explorer','elite','supreme'];
function makeLab(omitted=null,wrongName=null,offlineGuard=true) {
  const records=new Map(tiers.filter(x=>x!==omitted).map(x=>[
    'ncbr:vip_'+x,{name:x===wrongName?'Unexpected Rank':x[0].toUpperCase()+x.slice(1)},
  ]));
  const calls=[];
  const Server={
    VIPSystem:{
      vipRanks:{get:(tag)=>records.get(tag)},
      vipPlayers:{flushNow:()=>{calls.push('flush');return true}},
      getVIP:()=>{calls.push('getVIP');return null},
      grantDeliveryVIPLab:()=>{calls.push('grant');return 'applied'},
    },
    DeliveryIntegration:{getStatus:()=>({
      mode:'LAB_OFF',dispatchEnabled:false,realPaymentsEnabled:false,
      networkEnabled:false,deliveryEnabled:!offlineGuard,
    })},
  };
  const world={
    getDynamicProperty:()=>{calls.push('read');return undefined},
    setDynamicProperty:()=>{calls.push('write')},
  };
  return {Server,world,calls};
}
test('Three exact VIP ranks ready, but sales/transport and identity remain OFF',()=>{
  const f=makeLab(),logs=[];
  const v=reportNetCraftVipReadiness(f.Server,f.world,x=>logs.push(x));
  assert.equal(v.off,true);
  assert.equal(v.ranksConfigured,true);
  assert.equal(v.eligibleForRealDispatch,false);
  assert.equal(v.identityBindingVerified,false);
  assert.equal(v.signedTransportInstalled,false);
  assert.equal(logs.filter(x=>x.includes('CONFIGURED')).length,3);
  assert.equal(logs.at(-1),'[NCBR DELIVERY LAB] PRECHECK_RANKS_READY_DISPATCH_OFF_IDENTITY_OFF_NETWORK_OFF');
  assert.deepEqual(f.calls,[],'diagnostic must never write or call granting methods');
});
test('Missing VIP rank blocks readiness without modifying a database',()=>{
  const f=makeLab('elite'),v=inspectNetCraftVipReadiness(f.Server,f.world);
  assert.equal(v.ranksConfigured,false);
  assert.equal(v.ranks.find(x=>x.tier==='elite')?.status,'missing');
  assert.deepEqual(f.calls,[]);
});
test('Wrong configured rank names block matching',()=>{
  const f=makeLab(null,'supreme'),v=inspectNetCraftVipReadiness(f.Server,f.world);
  assert.equal(v.ranksConfigured,false);
  assert.equal(v.ranks.find(x=>x.tier==='supreme')?.status,'name_mismatch');
});
test('Absent Core VIP DB/methods blocks readiness',()=>{
  const f=makeLab();
  delete f.Server.VIPSystem.vipPlayers;
  const v=inspectNetCraftVipReadiness(f.Server,f.world);
  assert.equal(v.api.durableVipStore,false);
  assert.equal(v.eligibleForRealDispatch,false);
});
test('Missing OFF guard is explicitly reported and no grants are made',()=>{
  const f=makeLab(null,null,false),logs=[];
  const v=reportNetCraftVipReadiness(f.Server,f.world,x=>logs.push(x));
  assert.equal(v.off,false);
  assert.equal(logs.length,1);
  assert.match(logs[0],/OFF_GUARD_MISSING_DO_NOT_USE/);
  assert.deepEqual(f.calls,[]);
});
test('No rank list or Server object is fail closed',()=>{
  const v=inspectNetCraftVipReadiness(undefined,undefined);
  assert.equal(v.off,false);
  assert.equal(v.ranksConfigured,false);
  assert.ok(v.ranks.every(x=>x.status==='missing'));
});
