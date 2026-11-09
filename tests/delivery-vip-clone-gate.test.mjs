import test from "node:test";
import assert from "node:assert/strict";
import {installVipCloneLab} from "../minecraft/vip-clone-lab/vip_clone_lab.js";

/**
 * CI verifies that the isolated lab trigger refuses unauthorized execution.
 * The separate downloadable artifact is built from Core v2.3.38 and locally
 * tested against its own v2.3.38 nick_verified_executor.js implementation.
 */
const ACK="I_ACK_ISOLATED_WORLD_2_3_39",PLAYER="Halzin5212";
function make(options={}){
  const writes=new Map(),grants=[],tags=new Map();
  let current="",callback;
  const player={id:"isolated-test-player",typeId:"minecraft:player",
    name:PLAYER,isValid:true,hasTag:(t)=>t==="admin",sendMessage:()=>{}};
  const world={
    getAllPlayers:()=>[player],
    getDynamicProperty:k=>writes.get(k),
    setDynamicProperty:(k,v)=>writes.set(k,v),
  };
  const Server={
    Ranks:{getRank:t=>tags.get(t),createRank:(t,d)=>tags.set(t,d)},
    VIPSystem:{vipRanks:new Map(),getVIP:()=>current?{rankTag:current}:null,
      grantDeliveryVIPLab:(_name,rank,days,job)=>{
        assert.equal(days,30);
        assert.equal(job.gamertag,PLAYER);
        assert.equal(Server.DeliveryAuthorization.isReleaseApproved(),true);
        assert.equal(Server.DeliveryIdentity.isPlayerLinked(player),true);
        grants.push(rank);current=rank;return "applied";
      }},
  };
  const variables={get:k=>({
    NCBR_VIP_CLONE_GUARD:ACK,NCBR_DELIVERY_ENABLED:"OFF",
    NCBR_DELIVERY_LINK_ENABLED:false,NCBR_VIP_CLONE_GAMERTAG:PLAYER,
    ...options,
  })[k]};
  const createExecutor=({isDispatchApproved,verifyLinkedPlayer})=>({
    receiptStatus:id=>writes.get(id)||"none",
    execute(job){
      if(!isDispatchApproved())return {status:"disabled"};
      if(!verifyLinkedPlayer(player,job))return {status:"identity_unverified"};
      if(writes.has(job.id))return {status:"already_applied"};
      if(current&&current!==job.rankTag)
        return {status:"vip_upgrade_review_required"};
      writes.set(job.id,"started");
      const applied=Server.VIPSystem.grantDeliveryVIPLab(
        player.name,job.rankTag,job.days,job);
      if(applied!=="applied")return {status:"manual_review"};
      writes.set(job.id,"applied");
      return {status:"applied"};
    },
  });
  const result=installVipCloneLab({Server,world,
    system:{afterEvents:{scriptEventReceive:{
      subscribe:fn=>{callback=fn;},
    }}},variables,createExecutor});
  const emit=(tier,source=player,id="ncbrlab:vip_apply")=>
    callback?.({id,message:tier,sourceEntity:source});
  return {result,emit,writes,grants,Server};
}
test("explicit clone guard and commercial OFF required",()=>{
  for(const env of [
    {NCBR_VIP_CLONE_GUARD:"bad"},
    {NCBR_DELIVERY_ENABLED:"RELEASE_APPROVED"},
    {NCBR_DELIVERY_LINK_ENABLED:true},
    {NCBR_VIP_CLONE_GAMERTAG:""},
  ]){
    const x=make(env);
    assert.equal(x.result.enabled,false);
    assert.equal(x.grants.length,0);
  }
});
test("each tier can only produce one 30-day Core VIP grant",()=>{
  for(const tier of ["explorer","elite","supreme"]){
    const x=make();
    assert.equal(x.result.enabled,true);
    x.emit(tier);x.emit(tier);
    assert.deepEqual(x.grants,["ncbr:vip_"+tier]);
    assert.equal(x.Server.DeliveryAuthorization,undefined);
    assert.equal(x.Server.DeliveryIdentity,undefined);
    assert.equal(x.writes.get(x.result.getJob(tier).id),"applied");
  }
});
test("untrusted player, console, invalid tier and cross-tier switch fail closed",()=>{
  const x=make();
  x.emit("explorer",null);
  x.emit("explorer",{typeId:"minecraft:player",isValid:true,
    name:"OtherPlayer",hasTag:()=>true});
  x.emit("administrator");
  assert.equal(x.grants.length,0);
  x.emit("elite");
  x.emit("supreme");
  assert.deepEqual(x.grants,["ncbr:vip_elite"]);
  assert.equal(x.writes.size,1);
});
