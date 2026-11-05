import test from "node:test";
import assert from "node:assert/strict";
// @ts-ignore Pure Script API independent Core assembly, no live BDS.
import {createNetCraftVipMvpCore} from
  "../minecraft/delivery-core-v2324-fixture/vip_mvp_core_assembly.js";

const approved={mode:"RELEASE_APPROVED",dispatchEnabled:true,realPaymentsEnabled:true,
 networkEnabled:true,deliveryEnabled:true,verifiedPlayerBindingReady:true,
 privateGatewayReady:true};
const id="a".repeat(64),job={
  contract:"netcraft.delivery.v1",id:id+"-0",orderId:id,
  gamertag:"FakePlayer",kind:"vip",rankTag:"ncbr:vip_explorer",days:30,
};
function fixture(identityOk=true,enabled=true){
  const receipts=new Map<string,string>(),calls:string[]=[];
  const player={name:"FakePlayer",id:"linked-entity-1",isValid:true};
  const world={getAllPlayers:()=>[player],
    getDynamicProperty:(key:string)=>receipts.get(key),
    setDynamicProperty:(key:string,value:string)=>receipts.set(key,value)};
  let actualRank:string|null=null;
  const Server={DeliveryIntegration:{getStatus:()=>enabled?approved:{
    ...approved,mode:"LAB_OFF",dispatchEnabled:false}},
    VIPSystem:{vipRanks:new Map([["ncbr:vip_explorer",{name:"Explorer"}]]),
      getVIP:()=>actualRank?{rankTag:actualRank}:null,
      grantDeliveryVIPLab:(_name:string,rank:string,_days:number)=>{
        calls.push("VIP_GRANT");actualRank=rank;return "applied";
      },
    },
  };
  const transport={
    poll:async()=>{calls.push("poll");return {simulation:false,dispatchEnabled:true,
      deliveries:[{payload:job,leaseToken:"b".repeat(32),simulation:false,dispatchEnabled:true}]};},
    ack:async()=>{calls.push("ACK");},
    nack:async()=>{calls.push("NACK");},
  };
  const create=()=>createNetCraftVipMvpCore({world,Server,transport,
    ItemStack:class {},verifyPlayerIdentity:(p:any)=>identityOk&&p.id==="linked-entity-1"});
  return {create,calls,receipts};
}
test("v2330: Core REAL executor writes receipt, grants once, ACKs and survives reboots",async()=>{
  const f=fixture();
  assert.equal((await f.create().runOnce()).processed,1);
  assert.equal(f.calls.filter(x=>x==="VIP_GRANT").length,1);
  assert.equal((await f.create().runOnce()).processed,1);
  assert.equal(f.calls.filter(x=>x==="VIP_GRANT").length,1);
  assert.equal(f.calls.filter(x=>x==="ACK").length,2);
});
test("v2330: no verified player identity means NO writes, NO VIP and NO ACK",async()=>{
  const f=fixture(false);
  const result=await f.create().runOnce();
  assert.equal(result.processed,0);
  assert.equal(f.calls.includes("VIP_GRANT"),false);
  assert.equal(f.calls.includes("ACK"),false);
  assert.equal(f.receipts.size,0);
});
test("v2330: LAB OFF means no polling and no money-to-reward path",async()=>{
  const f=fixture(true,false);
  assert.equal((await f.create().runOnce()).status,"release_off");
  assert.deepEqual(f.calls,[]);
  assert.equal(f.receipts.size,0);
});
