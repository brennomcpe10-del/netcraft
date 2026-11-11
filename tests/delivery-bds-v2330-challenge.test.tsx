// Real NetCraftCore v2.3.30 compatible transport CONTRACT, entirely mocked.
// No BDS process, real credential, Mercado Pago, Firebase or reward is used.
import test from "node:test";
import assert from "node:assert/strict";
import {
  issuePrivateBdsChallenge,createOpaqueBdsNickReleaseAdapter,
  OpaqueNickBridgeBlocked,
} from "../server/delivery/bdsOpaqueNickReleaseAdapter.ts";
import {authenticateBdsRequest} from "../server/delivery/bdsSignedRequest.ts";
// @ts-ignore -- dependency-injected BDS-only plain JS fixture
import {createNickBdsTransportChallenge}
  from "../minecraft/delivery-core-v2330-clone/nick_bds_transport_challenge.js";

const NOW=1793992800000;
const TOKEN="T".repeat(64),KEY="K".repeat(64);
const JOB="a".repeat(64)+"-0";
const envKeys=["NODE_ENV","VERCEL_ENV","FIRESTORE_EMULATOR_HOST",
  "NETCRAFT_DELIVERY_RELEASE_APPROVED","NCBR_COMMERCIAL_MP_ACCESS_TOKEN",
  "NCBR_COMMERCIAL_FIREBASE_SERVICE_ACCOUNT_JSON"];
async function withIsolatedMock<T>(run:()=>Promise<T>):Promise<T>{
  const before=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
  process.env.NODE_ENV="production";
  process.env.VERCEL_ENV="production";
  delete process.env.FIRESTORE_EMULATOR_HOST;
  process.env.NETCRAFT_DELIVERY_RELEASE_APPROVED="PRIVATE_GATEWAY_REVIEWED";
  process.env.NCBR_COMMERCIAL_MP_ACCESS_TOKEN="MOCK_ENV_ONLY";
  process.env.NCBR_COMMERCIAL_FIREBASE_SERVICE_ACCOUNT_JSON="MOCK_ENV_ONLY";
  try{return await run();}
  finally{
    for(const k of envKeys) {
      if(before[k]===undefined)delete process.env[k];
      else process.env[k]=before[k];
    }
  }
}
function fakeDb(){
  const records=new Set<string>();
  return {
    collection:(name:string)=>({doc:(id:string)=>({key:name+"/"+id})}),
    runTransaction:async(fn:(tx:any)=>Promise<any>)=>{
      const writes:string[]=[];
      const result=await fn({
        get:async(ref:any)=>({exists:records.has(ref.key)}),
        create:(ref:any)=>writes.push(ref.key),
      });
      for(const key of writes)records.add(key);
      return result;
    },
  };
}
function makeNetwork(mockChallenge?:(value:any)=>any){
  const calls:any[]=[];
  const db=fakeDb();
  const service={
    authenticatedRequest:async(msg:any,verified:boolean)=>{
      assert.equal(verified,true);
      await authenticateBdsRequest(db as any,msg,
        {netcraft_nick_private:KEY},NOW);
      if(msg.action==="poll")
        return {schema:1,simulation:false,dispatchEnabled:false,deliveries:[]};
      if(msg.action==="ack")return {status:"acknowledged"};
      return {status:"held"};
    },
  };
  const adapter=createOpaqueBdsNickReleaseAdapter({
    service,secret:TOKEN,hmacKey:KEY,now:()=>NOW});
  const secretString=Object.freeze({opaque:true});
  const http={request:async(req:any)=>{
    calls.push(req);
    const headers=Object.fromEntries(req.headers.map((x:any)=>[
      x.key.toLowerCase(),x.value===secretString?TOKEN:x.value]));
    const action=req.uri.split("/").at(-1);
    if(action==="challenge"){
      const issued=issuePrivateBdsChallenge({
        method:req.method,transportVerified:true,body:req.body,
        receivedToken:headers["x-nc-bds-token"],secret:TOKEN,now:()=>NOW,
      });
      return {status:200,body:JSON.stringify(mockChallenge?
        mockChallenge(issued):issued)};
    }
    const result=await adapter({
      method:req.method,action,transportVerified:true,
      body:req.body,headers,
    });
    return {status:200,body:JSON.stringify(result)};
  }};
  class HttpRequest {
    method:any;headers:any;body:any;timeout:any;
    constructor(public uri:string){}
  }
  class HttpHeader {
    constructor(public key:string,public value:any){}
  }
  const client=createNickBdsTransportChallenge({
    http,HttpRequest,HttpHeader,HttpRequestMethod:{Post:"POST"},
    secret:secretString,
    baseUrl:"https://127.0.0.1:18443/api/delivery/bds",clock:()=>NOW,
  });
  return {client,calls,adapter,secretString};
}
test("server-issued nonce challenge is crypto-unique, never a grant",async()=>{
  await withIsolatedMock(async()=>{
    const input={method:"POST",transportVerified:true,body:'{"schema":1}',
      receivedToken:TOKEN,secret:TOKEN,now:()=>NOW};
    const first=issuePrivateBdsChallenge(input);
    const second=issuePrivateBdsChallenge(input);
    assert.match(first.nonce,/^[a-f0-9]{32}$/);
    assert.notEqual(first.nonce,second.nonce);
    assert.equal(first.timestamp,String(NOW));
    assert.equal(first.dispatchEnabled,false);
    assert.equal(first.simulation,false);
    assert.deepEqual(Object.keys(first).sort(),
      ["dispatchEnabled","nonce","schema","simulation","timestamp"].sort());
    assert.throws(()=>issuePrivateBdsChallenge({...input,receivedToken:"F".repeat(64)}),
      (e:any)=>e instanceof OpaqueNickBridgeBlocked&&e.reason==="unauthorized_bds_request");
    assert.throws(()=>issuePrivateBdsChallenge({...input,transportVerified:false}),
      (e:any)=>e instanceof OpaqueNickBridgeBlocked&&e.reason==="bad_bds_request");
  });
});
test("v2.3.30 mock client polls and ACKs with separate server-issued one-time nonces",async()=>{
  await withIsolatedMock(async()=>{
    const f=makeNetwork();
    assert.deepEqual(await f.client.poll("Halzin5212"),
      {schema:1,simulation:false,dispatchEnabled:false,deliveries:[]});
    assert.deepEqual(await f.client.ack(JOB,"b".repeat(32),"applied"),
      {status:"acknowledged"});
    assert.equal(f.calls.length,4);
    assert.deepEqual(f.calls.map(x=>x.uri.split("/").at(-1)),
      ["challenge","poll","challenge","ack"]);
    const first=f.calls[1].headers.find((x:any)=>x.key==="x-nc-nonce").value;
    const second=f.calls[3].headers.find((x:any)=>x.key==="x-nc-nonce").value;
    assert.notEqual(first,second);
    assert.equal(f.calls[1].headers.find((x:any)=>x.key==="x-nc-bds-token").value,
      f.secretString);
    const replayHeaders=Object.fromEntries(f.calls[1].headers.map((x:any)=>[
      x.key.toLowerCase(),x.value===f.secretString?TOKEN:x.value]));
    await assert.rejects(()=>f.adapter({method:"POST",action:"poll",
      transportVerified:true,body:f.calls[1].body,headers:replayHeaders}),
      /replayed_request/);
  });
});
test("malformed or stale server challenge blocks ANY subsequent BDS poll",async()=>{
  await withIsolatedMock(async()=>{
    for(const mutate of [
      (v:any)=>({...v,nonce:"bad"}),
      (v:any)=>({...v,timestamp:String(NOW-120001)}),
      (v:any)=>({...v,dispatchEnabled:true}),
    ]){
      const f=makeNetwork(mutate);
      await assert.rejects(()=>f.client.poll("Halzin5212"),
        /SECURE_CHALLENGE_UNAVAILABLE/);
      assert.equal(f.calls.length,1);
      assert.match(f.calls[0].uri,/\/challenge$/);
    }
  });
});
test("private nonce challenge cannot be issued from Preview or LAB",async()=>{
  await withIsolatedMock(async()=>{
    process.env.VERCEL_ENV="preview";
    assert.throws(()=>issuePrivateBdsChallenge({
      method:"POST",transportVerified:true,body:'{"schema":1}',
      receivedToken:TOKEN,secret:TOKEN,now:()=>NOW,
    }),(e:any)=>e instanceof OpaqueNickBridgeBlocked&&
      e.reason==="release_not_authorized");
  });
});
