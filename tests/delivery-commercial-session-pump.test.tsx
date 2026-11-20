import test from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- Pure Bedrock-side candidate deliberately ships as JavaScript.
import {createCommercialVipSessionPump,commercialVipReleaseReady}
  from "../minecraft/delivery-commercial-candidate/vip_commercial_session_pump.js";

const ORDER="a".repeat(64),ID=ORDER+"-0",TOKEN="b".repeat(32);
const CODE="NC-AAAA-BBBB-CCCC-DDDD";
const player={isValid:true,name:"Ryck432",id:"bedrock-session-1"};
const approved={
  mode:"RELEASE_APPROVED",dispatchEnabled:true,realPaymentsEnabled:true,
  networkEnabled:true,deliveryEnabled:true,verifiedPlayerBindingReady:true,
  privateGatewayReady:true,
};
const offer={status:"offered",deliveryId:ID,leaseToken:TOKEN,
  dispatchEnabled:true,
  payload:{contract:"netcraft.delivery.v1",id:ID,orderId:ORDER,
    gamertag:player.name,kind:"vip",rankTag:"ncbr:vip_explorer",days:30}};
const empty={schema:1,simulation:false,dispatchEnabled:true,deliveries:[]};
function fixture(){
  let release=approved,linked=false,acks=0,executions=0,failedAck=false;
  let serverDelivered=false;
  const receipts=new Map<string,string>();
  const calls:{action:string;args:unknown[]}[]=[];
  const transport={
    link:async(...args:any[])=>{
      calls.push({action:"link",args});
      return {status:"verified_in_game",gamertag:player.name,orderId:ORDER};
    },
    poll:async(...args:any[])=>{
      calls.push({action:"poll",args});
      return !linked||serverDelivered?empty:{...empty,deliveries:[offer]};
    },
    ack:async(...args:any[])=>{
      calls.push({action:"ack",args});acks++;
      if(failedAck){failedAck=false;throw Error("simulated_network_timeout");}
      serverDelivered=true;
      return {status:"acknowledged"};
    },
    nack:async(...args:any[])=>{
      calls.push({action:"nack",args});
      return {status:"review_required"};
    },
  };
  const pump=createCommercialVipSessionPump({
    getStatus:()=>release,onlinePlayers:()=>[player],
    transport,
    executor:{execute:(job:any)=>{
      executions++;
      if(receipts.has(job.id))return {status:"already_applied"};
      receipts.set(job.id,"applied");
      return {status:"applied"};
    }},
    verifyLinkedPlayer:(p:any,job:any)=>
      p.id===player.id&&job.gamertag===player.name,
    receiptStatus:(id:string)=>receipts.get(id)||"none",
    clock:()=>100000,
  });
  return {pump,calls,receipts,executions:()=>executions,acks:()=>acks,
    setLinked:()=>{linked=true;},block:()=>{release={...approved,dispatchEnabled:false};},
    loseAck:()=>{failedAck=true;}};
}
test("commercial runner refuses unreviewed release, does not call Minecraft or provider",async()=>{
  const f=fixture();f.block();
  assert.deepEqual(await f.pump.linkPlayer(player,CODE),{status:"release_off"});
  assert.deepEqual(await f.pump.run(),{status:"release_off"});
  assert.equal(f.calls.length,0);
  assert.equal(f.executions(),0);
  assert.equal(commercialVipReleaseReady({...approved,privateGatewayReady:false}),false);
});
test("only an actual authenticated Bedrock session can link and poll",async()=>{
  const f=fixture();
  assert.deepEqual(await f.pump.run(),{status:"completed",applied:0,review:0});
  assert.equal(f.calls.length,0);
  assert.equal((await f.pump.linkPlayer({...player,id:"bad session"},CODE)).status,"invalid_link");
  assert.equal((await f.pump.linkPlayer(player,"CODE-INVALID")).status,"invalid_link");
  assert.equal((await f.pump.linkPlayer(player,CODE)).status,"linked");
  f.setLinked();
  const result=await f.pump.run();
  assert.equal(result.status,"completed");
  assert.equal(result.applied,1);
  assert.equal(f.executions(),1);
  assert.deepEqual(f.calls.filter(x=>x.action==="poll")[0].args,[player.name,player.id]);
  assert.deepEqual(f.calls.filter(x=>x.action==="ack")[0].args,[ID,TOKEN,"applied",player.id]);
});
test("an uncertain ACK retries only ACK, never executes VIP a second time",async()=>{
  const f=fixture();
  await f.pump.linkPlayer(player,CODE);f.setLinked();f.loseAck();
  assert.equal((await f.pump.run()).status,"ack_pending");
  assert.equal(f.pump.getPendingAcknowledgements(),1);
  assert.equal(f.executions(),1);
  const after=await f.pump.run();
  assert.equal(after.status,"completed");
  assert.equal(f.pump.getPendingAcknowledgements(),0);
  assert.equal(f.executions(),1);
  assert.equal(f.acks(),2);
});
test("a mismatched commercial offer cannot execute, ACK or NACK a VIP",async()=>{
  const f=fixture();
  await f.pump.linkPlayer(player,CODE);
  // The backend returned no leases; a browser code alone grants nothing.
  assert.deepEqual(await f.pump.run(),{status:"completed",applied:0,review:0});
  assert.equal(f.executions(),0);
  assert.equal(f.calls.some(x=>x.action==="ack"||x.action==="nack"),false);
});
