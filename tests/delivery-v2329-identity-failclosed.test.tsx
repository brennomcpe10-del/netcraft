// v2.3.29 LAB OFF: the Core executor must never trust a gamertag alone.
// Xbox/Microsoft authentication is NOT implemented. This tests only that
// the trusted identity callback remains mandatory for a synthetic BDS clone.
import {test} from "node:test";
import assert from "node:assert/strict";
// @ts-ignore pure JS offline fixture, not mounted in a live BDS entrypoint
import {createVerifiedLabExecutor} from "../minecraft/delivery-core-v2324-fixture/verified_executor.js";

const ORDER="a".repeat(64);
const job={contract:"netcraft.delivery.v1",id:ORDER+"-0",orderId:ORDER,
  gamertag:"Fake Player",kind:"vip",rankTag:"ncbr:vip_explorer",days:30};
function clone(opts:{
  observedPlayerId?:string;
  verifyLinkedPlayer?:(p:any,j:any)=>boolean;
  offline?:boolean;
}={}){
  const writes:string[]=[];
  const store=new Map<string,string>();
  const player={id:opts.observedPlayerId??"synthetic-player-1",
    name:"Fake Player",isValid:true};
  const world={
    getAllPlayers:()=>[player],
    getDynamicProperty:(key:string)=>store.get(key),
    setDynamicProperty:(key:string,value:string)=>{
      writes.push(key);store.set(key,value);
    },
  };
  const Server={VIPSystem:{
    vipRanks:new Map([["ncbr:vip_explorer",{name:"Explorer"}]]),
    getVIP:()=>null,
    grantDeliveryVIPLab:()=>{writes.push("VIP_GRANT");return "applied";},
  }};
  const exec=createVerifiedLabExecutor({world,Server,
    ItemStack:class {},verifyLinkedPlayer:opts.verifyLinkedPlayer,
    isOfflineClone:()=>opts.offline??true});
  return {exec,writes,player};
}

test("v2329: matching gamertag WITHOUT trusted identity binding never grants",()=>{
  const s=clone();
  assert.equal(s.exec.execute(job).status,"identity_unverified");
  assert.deepEqual(s.writes,[]);
});
test("v2329: attacker using same gamertag but different persistent player id is refused",()=>{
  const expectedPlayerId="synthetic-player-1";
  const s=clone({observedPlayerId:"synthetic-attacker",verifyLinkedPlayer:p=>
    p.id===expectedPlayerId});
  assert.equal(s.exec.execute(job).status,"identity_unverified");
  assert.deepEqual(s.writes,[]);
});
test("v2329: trusted identity adapter errors fail closed",()=>{
  const s=clone({verifyLinkedPlayer:()=>{throw Error("identity_verifier_unavailable");}});
  assert.equal(s.exec.execute(job).status,"identity_unverified");
  assert.deepEqual(s.writes,[]);
});
test("v2329: even verified SYNTHETIC identity cannot activate grant outside offline clone",()=>{
  const s=clone({offline:false,verifyLinkedPlayer:()=>true});
  assert.equal(s.exec.execute(job).status,"disabled");
  assert.deepEqual(s.writes,[]);
});
test("v2329: synthetic authorized Core path is separate from Xbox and always LAB gated",()=>{
  const s=clone({verifyLinkedPlayer:(p:any,j:any)=>
    p.id==="synthetic-player-1"&&j.gamertag==="Fake Player"});
  assert.equal(s.exec.execute(job).status,"applied");
  assert.equal(s.exec.execute(job).status,"already_applied");
  assert.equal(s.writes.filter(x=>x==="VIP_GRANT").length,1);
});
