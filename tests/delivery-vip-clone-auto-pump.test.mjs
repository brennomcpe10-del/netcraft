import test from "node:test";
import assert from "node:assert/strict";
import {createCloneVipAutoPump,installVipCloneAuto}
  from "../minecraft/vip-clone-lab/vip_clone_auto.js";
const ORDER="a".repeat(64),RECEIPT="f".repeat(64),LEASE="b".repeat(32);
const OWNER="Halzin5212";
const job=tier=>({contract:"netcraft.delivery.v1",id:ORDER+"-0",
  orderId:ORDER,gamertag:OWNER,kind:"vip",rankTag:"ncbr:vip_"+tier,days:30});
function fixture({tier="explorer",wrongPlayer=false,ackFail=false,invalid=false,
  linked=true}={}){
  const receipts=new Map(),ranks=new Map(),vipRanks=new Map(),logs=[];
  let rank=null,grants=0,polls=0,acks=0,nacks=0,callback;
  const player={id:"isolated-player-1",name:wrongPlayer?"WrongName":OWNER,
    typeId:"minecraft:player",isValid:true,hasTag:x=>x==="admin"};
  const world={
    getAllPlayers:()=>[player],
    getDynamicProperty:key=>receipts.get(key),
    setDynamicProperty:(key,value)=>receipts.set(key,value),
  };
  const Server={DeliveryLink:{
    isPlayerLinked:p=>linked===true&&p.id===player.id&&p.name===OWNER,
  },VIPSystem:{
    vipRanks,
    getVIP:()=>rank?{rankTag:rank}:null,
    grantDeliveryVIPLab:(_name,newRank,days,delivery)=>{
      assert.equal(days,30);
      assert.equal(Server.DeliveryAuthorization?.isReleaseApproved?.(),true);
      assert.equal(Server.DeliveryIdentity?.isPlayerLinked?.(player),true);
      assert.equal(Server.DeliveryIdentity?.verifyLinkedPlayer?.(player,delivery),true);
      grants++;rank=newRank;return "applied";
    },
  },Ranks:{
    getRank:key=>ranks.get(key),
    createRank:(key,value)=>ranks.set(key,value),
  }};
  const transport={request:async(action,body)=>{
    if(action==="poll"){
      polls++;
      if(polls>1)return {schema:1,cloneOnly:true,simulation:true,
        commercialDispatchEnabled:false,paymentsEnabled:false,offer:null};
      return {schema:1,cloneOnly:true,simulation:true,
        commercialDispatchEnabled:false,paymentsEnabled:false,
        offer:{receiptId:RECEIPT,leaseToken:LEASE,
          payload:invalid?{...job(tier),days:365}:job(tier)}};
    }
    if(action==="ack"){
      acks++;
      if(ackFail&&acks===1)throw Error("broken_https_response");
      assert.equal(body.result,"applied");
      assert.equal(body.receiptId,RECEIPT);
      assert.equal(body.leaseToken,LEASE);
      return {status:"acknowledged_clone"};
    }
    if(action==="nack"){
      nacks++;
      return {status:"manual_review"};
    }
    throw Error("unexpected action");
  }};
  function createExecutor({isDispatchApproved,verifyLinkedPlayer}){
    return {
      receiptStatus:id=>receipts.get(id)||"none",
      execute:delivery=>{
        if(!isDispatchApproved()||!verifyLinkedPlayer(player,delivery))
          return {status:"identity_unverified"};
        if(receipts.get(delivery.id)==="applied")
          return {status:"already_applied"};
        if(receipts.has(delivery.id))return {status:"manual_review"};
        if(rank&&rank!==delivery.rankTag)
          return {status:"vip_upgrade_review_required"};
        receipts.set(delivery.id,"started");
        Server.VIPSystem.grantDeliveryVIPLab(OWNER,delivery.rankTag,30);
        receipts.set(delivery.id,"applied");
        return {status:"applied"};
      },
    };
  }
  const pump=createCloneVipAutoPump({
    world,Server,transport,createExecutor,owner:OWNER,
    system:{runInterval:fn=>{callback=fn;}},log:x=>logs.push(x),
  });
  return {pump,receipts,ranks,logs,callback,Server,
    get rank(){return rank;},get grants(){return grants;},
    get polls(){return polls;},get acks(){return acks;},get nacks(){return nacks;}};
}
test("BDS clone automatically applies each exact 30-day synthetic VIP once",async()=>{
  for(const tier of ["explorer","elite","supreme"]){
    const x=fixture({tier});
    await x.pump.tick();
    assert.equal(x.grants,1);
    assert.equal(x.rank,"ncbr:vip_"+tier);
    assert.equal(x.receipts.get(job(tier).id),"applied");
    assert.equal(x.acks,1);
    assert.equal(x.pump.getPending(),false);
    assert.equal(x.Server.DeliveryAuthorization,undefined);
    assert.equal(x.Server.DeliveryIdentity,undefined);
    await x.pump.tick();
    assert.equal(x.grants,1);
    assert.ok(x.logs.some(line=>line.includes("commercial=OFF")));
  }
});
test("ACK network failure retries ACK but never executes VIP twice",async()=>{
  const x=fixture({ackFail:true});
  await x.pump.tick();
  assert.equal(x.grants,1);
  assert.equal(x.pump.getPending(),true);
  await x.pump.tick();
  assert.equal(x.grants,1);
  assert.equal(x.acks,2);
  assert.equal(x.polls,1);
  assert.equal(x.pump.getPending(),false);
});
test("wrong BDS player or forged payload never grants VIP",async()=>{
  const other=fixture({wrongPlayer:true});
  await other.pump.tick();
  assert.equal(other.grants,0);
  assert.equal(other.polls,0);
  const notLinked=fixture({linked:false});
  await notLinked.pump.tick();
  assert.equal(notLinked.polls,0);
  assert.equal(notLinked.grants,0);
  const forged=fixture({invalid:true});
  await forged.pump.tick();
  assert.equal(forged.grants,0);
  assert.equal(forged.acks,0);
  assert.equal(forged.nacks,0);
});
test("auto mode remains OFF without clone-specific guard and secrets",async()=>{
  const defaults={
    NCBR_VIP_CLONE_AUTO_ENABLED:true,
    NCBR_VIP_CLONE_GUARD:"I_ACK_ISOLATED_WORLD_2_3_40",
    NCBR_VIP_CLONE_GAMERTAG:OWNER,
    NCBR_VIP_CLONE_AUTO_URL:
      "https://preview.example.com/api/delivery/lab-clone-vip/bds",
    NCBR_DELIVERY_ENABLED:"OFF",NCBR_DELIVERY_LINK_ENABLED:true,
  };
  const vars=extra=>({get:k=>({...defaults,...extra})[k]});
  const secrets={get:()=>undefined};
  for(const extra of [
    {NCBR_VIP_CLONE_AUTO_ENABLED:false},
    {NCBR_VIP_CLONE_GUARD:"wrong"},
    {NCBR_DELIVERY_ENABLED:"RELEASE_APPROVED"},
    {NCBR_DELIVERY_LINK_ENABLED:false},
    {NCBR_VIP_CLONE_GAMERTAG:"OtherPlayer"},
    {NCBR_VIP_CLONE_AUTO_URL:"http://localhost/unsafe"},
  ]){
    const answer=await installVipCloneAuto({
      Server:{},world:{},system:{},variables:vars(extra),
      secrets,createExecutor:()=>null,
      loadNet:async()=>{throw Error("network_must_not_open");},
    });
    assert.equal(answer.enabled,false);
  }
  const noSecret=await installVipCloneAuto({
    Server:{VIPSystem:{grantDeliveryVIPLab:()=>{},vipRanks:new Map()},
      Ranks:{createRank:()=>{}}},
    world:{},system:{},variables:vars({}),secrets,createExecutor:()=>null,
    loadNet:async()=>{throw Error("network_must_not_open");},
  });
  assert.equal(noSecret.enabled,false);
  assert.equal(noSecret.reason,"CLONE_PRIVATE_SECRETS_MISSING");
});
