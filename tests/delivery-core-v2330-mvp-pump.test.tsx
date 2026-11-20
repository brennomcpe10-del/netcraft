import test from "node:test";
import assert from "node:assert/strict";
// @ts-ignore JS-only BDS script: pure logic, never imports the live client
import {createMvpDeliveryPump,validateMvpOffer,releaseReady} from
  "../minecraft/delivery-core-v2324-fixture/vip_mvp_delivery_pump.js";

const approved={mode:"RELEASE_APPROVED",dispatchEnabled:true,
  realPaymentsEnabled:true,networkEnabled:true,deliveryEnabled:true,
  verifiedPlayerBindingReady:true,privateGatewayReady:true};
const order="a".repeat(64);
const payload={contract:"netcraft.delivery.v1",id:order+"-0",
  orderId:order,gamertag:"FakePlayer",kind:"vip",
  rankTag:"ncbr:vip_explorer",days:30};
const offer={payload,leaseToken:"b".repeat(32),simulation:false,dispatchEnabled:true};
const player={name:"FakePlayer",id:"synthetic-id",isValid:true};
function setup(opts:any={}){
  const calls:string[]=[];
  const pump=createMvpDeliveryPump({
    getStatus:()=>opts.status||approved,
    onlinePlayers:()=>[player],
    transport:{
      poll:async()=>{calls.push("poll");return opts.reply||{
        simulation:false,dispatchEnabled:true,deliveries:[offer]};},
      ack:async()=>{calls.push("ack");},
      nack:async()=>{calls.push("nack");},
    },
    executor:{execute:()=>{calls.push("grant");return {status:opts.result||"applied"};}},
    receiptStatus:()=>opts.receipt||"applied",
    linkVerified:()=>opts.linked===undefined?true:opts.linked,
  });
  return {pump,calls};
}
test("MVP: LAB OFF never polls or gives VIP",async()=>{
  const x=setup({status:{...approved,mode:"LAB_OFF",dispatchEnabled:false}});
  assert.equal((await x.pump.run()).status,"release_off");
  assert.deepEqual(x.calls,[]);
});
test("MVP: genuine release, exact player and signed transport can execute then ACK",async()=>{
  const x=setup();const r=await x.pump.run();
  assert.deepEqual(r,{status:"completed",processed:1,manualReview:0});
  assert.deepEqual(x.calls,["poll","grant","ack"]);
});
test("MVP: forged paid flag, wrong price-tier schema, or synthetic offer never grants",async()=>{
  for(const bad of [
    {...offer,dispatchEnabled:false},
    {...offer,simulation:true},
    {...offer,payload:{...payload,days:90}},
    {...offer,payload:{...payload,gamertag:"WrongPlayer"}},
    {...offer,payload:{...payload,rankTag:"admin"}},
  ]){
    const x=setup({reply:{simulation:false,dispatchEnabled:true,deliveries:[bad]}});
    assert.equal((await x.pump.run()).processed,0);
    assert.deepEqual(x.calls,["poll"]);
  }
});
test("MVP: missing trusted identity proof denies grant",async()=>{
  const x=setup({linked:false});
  assert.equal((await x.pump.run()).processed,0);
  assert.deepEqual(x.calls,["poll"]);
});
test("MVP: applied receipt and failed ACK is not re-issued by the runner",async()=>{
  const x=setup({result:"manual_review",receipt:"started"});
  const r=await x.pump.run();
  assert.equal(r.manualReview,1);
  assert.deepEqual(x.calls,["poll","grant","nack"]);
});
test("MVP: no valid release bits means no grant",()=>{
  assert.equal(releaseReady({...approved,realPaymentsEnabled:false}),false);
  assert.equal(validateMvpOffer(offer),true);
  assert.equal(validateMvpOffer({...offer,leaseToken:"invalid"}),false);
});
