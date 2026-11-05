import test from "node:test";
import assert from "node:assert/strict";
// @ts-ignore pure JS driver, injected Bedrock dependencies
import {createBdsMvpNetTransport} from
  "../minecraft/delivery-core-v2324-fixture/vip_mvp_bds_transport.js";
const url="https://localhost:18443/api/delivery/bds";
const token={secretString:true}; // not printable, real BDS uses SecretString
const ORDER="a".repeat(64)+"-0";
function factory(result:any={simulation:true,dispatchEnabled:false,deliveries:[]}){
 const calls:any[]=[];
 class HttpRequest {method:any;headers:any;body:any;timeout:any;
   constructor(public uri:string){}}
 class HttpHeader{constructor(public key:string,public value:any){}}
 const driver=createBdsMvpNetTransport({
   http:{request:async(req:any)=>{calls.push(req);return {status:200,body:JSON.stringify(result)};}},
   HttpRequest,HttpHeader,HttpRequestMethod:{Post:"POST"},
   secret:token,baseUrl:url,clock:()=>1783500000000,nonce:()=>"1".repeat(32),
 });
 return {driver,calls};
}
test("v2330 BDS creates HTTPS POST with SecretString, nonce and timestamp",async()=>{
 const {driver,calls}=factory();
 const r=await driver.poll("FakePlayer");
 assert.equal(r.simulation,true);
 assert.equal(calls.length,1);
 assert.equal(calls[0].uri,url+"/poll");
 assert.equal(calls[0].method,"POST");
 assert.equal(calls[0].headers.find((x:any)=>x.key==="x-nc-bds-token").value,token);
 assert.deepEqual(JSON.parse(calls[0].body),{gamertag:"FakePlayer",online:true});
});
test("v2330 BDS sends ACK and NACK with exact lease and delivery ID",async()=>{
 const {driver,calls}=factory({});
 await driver.ack(ORDER,"b".repeat(32),"applied");
 await driver.nack(ORDER,"c".repeat(32),"player_offline","none");
 assert.equal(calls[0].uri,url+"/ack");
 assert.equal(calls[1].uri,url+"/nack");
 assert.deepEqual(JSON.parse(calls[0].body),
  {deliveryId:ORDER,leaseToken:"b".repeat(32),result:"applied"});
});
test("v2330 refuses HTTP, invalid players, invalid ACK and missing secret",async()=>{
 assert.throws(()=>factory().driver.poll(""),/BDS_MVP_PLAYER_INVALID/);
 assert.throws(()=>factory().driver.ack("bad","b".repeat(32),"applied"),/BDS_MVP_ACK_INVALID/);
 const {driver}=factory();
 await assert.rejects(()=>driver.nack(ORDER,"b".repeat(32),"offline","bad"),/BDS_MVP_NACK_INVALID/);
 const init=()=>createBdsMvpNetTransport({
   http:{request:async()=>({status:200,body:"{}"})},
   HttpRequest:class{},HttpHeader:class{},HttpRequestMethod:{Post:"POST"},
   secret:token,baseUrl:"http://localhost:18443/api/delivery/bds",
 });
 assert.throws(init,/BDS_MVP_NET_CONFIGURATION_BLOCKED/);
});
