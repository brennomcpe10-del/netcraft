import test from "node:test";
import assert from "node:assert/strict";
import {
  createOpaqueBdsMvpAdapter, OpaqueBridgeBlocked,
} from "../server/delivery/bdsOpaqueMvpAdapter.ts";
import {authenticateBdsRequest} from "../server/delivery/bdsSignedRequest.ts";

const now=1783500000000,token="A".repeat(64),hmac="private-bridge-lab-only-key-"+("B".repeat(64));
const baseEnv=["NODE_ENV","FIRESTORE_EMULATOR_HOST","VERCEL_ENV",
  "MERCADOPAGO_ACCESS_TOKEN","MP_ACCESS_TOKEN","FIREBASE_SERVICE_ACCOUNT_JSON"];
async function inLab(fn:()=>Promise<void>) {
  const prev=Object.fromEntries(baseEnv.map(k=>[k,process.env[k]]));
  try {
    process.env.NODE_ENV="test";
    process.env.FIRESTORE_EMULATOR_HOST="127.0.0.1:8085";
    for(const k of baseEnv.slice(2))delete process.env[k];
    await fn();
  } finally {
    for(const k of baseEnv) {
      if(prev[k]===undefined)delete process.env[k];
      else process.env[k]=prev[k];
    }
  }
}
function fakeDb(){
  const used=new Set<string>();
  return {
    collection:(name:string)=>({doc:(id:string)=>({key:name+"/"+id})}),
    runTransaction:async (fn:(tx:any)=>Promise<any>)=>{
      let inserted:string|null=null;
      const result=await fn({
        get:async (ref:{key:string})=>({exists:used.has(ref.key)}),
        create:(ref:{key:string})=>{inserted=ref.key;},
      });
      if(inserted)used.add(inserted);
      return result;
    },
  };
}
function request(nonce="a".repeat(32),timestamp=String(now)) {
  return {method:"POST",action:"poll",transportVerified:true,
    body:JSON.stringify({gamertag:"Offline Tester",online:false}),
    headers:{"x-nc-bds-token":token,"x-nc-nonce":nonce,"x-nc-timestamp":timestamp}};
}
const rejected=(reason:string)=>(e:any)=>
  e instanceof OpaqueBridgeBlocked && e.reason===reason;

test("MVP: opaque header bridges to existing durable HMAC verifier; replay fails",async()=>{
  await inLab(async()=>{
    const db=fakeDb(),called:string[]=[];
    const service={
      authenticatedRequest:async(msg:any,tls:boolean)=>{
        assert.equal(tls,true);
        const verified=await authenticateBdsRequest(db as any,msg,
          {netcraft_mvp_lab:hmac},now);
        called.push(msg.action);return {...verified,dispatchEnabled:false};
      },
    };
    const adapter=createOpaqueBdsMvpAdapter({service,secret:token,hmacKey:hmac,now:()=>now});
    const first=await adapter(request()) as any;
    assert.equal(first.verified,true);
    assert.equal(first.dispatchEnabled,false);
    await assert.rejects(()=>adapter(request()),/replayed_request/);
    assert.deepEqual(called,["poll"]);
  });
});

test("MVP: forged token, timestamp, TLS and body fail before service read",async()=>{
  await inLab(async()=>{
    let count=0;
    const adapter=createOpaqueBdsMvpAdapter({
      service:{authenticatedRequest:async()=>{count++;return {};}},secret:token,
      hmacKey:hmac,now:()=>now,
    });
    await assert.rejects(()=>adapter({...request(),transportVerified:false}),
      rejected("bad_bds_request"));
    await assert.rejects(()=>adapter({...request(),method:"GET"}),
      rejected("bad_bds_request"));
    await assert.rejects(()=>adapter({...request(),action:"grant"}),
      rejected("bad_bds_request"));
    await assert.rejects(()=>adapter({...request(),body:"x".repeat(4097)}),
      rejected("bad_bds_request"));
    await assert.rejects(()=>adapter({...request(),headers:{
      ...request().headers,"x-nc-bds-token":"C".repeat(64),
    }}),rejected("unauthorized_bds_request"));
    await assert.rejects(()=>adapter(request("b".repeat(32),String(now-120000))),
      rejected("unauthorized_bds_request"));
    assert.equal(count,0);
  });
});

test("MVP: production is ALWAYS blocked, regardless of a valid token",async()=>{
  await inLab(async()=>{
    let hits=0;
    const adapter=createOpaqueBdsMvpAdapter({
      service:{authenticatedRequest:async()=>{hits++;return {};}},secret:token,
      hmacKey:hmac,now:()=>now,
    });
    process.env.NODE_ENV="production";
    await assert.rejects(()=>adapter(request()),rejected("release_not_authorized"));
    process.env.NODE_ENV="test";
    process.env.VERCEL_ENV="preview";
    await assert.rejects(()=>adapter(request()),rejected("release_not_authorized"));
    delete process.env.VERCEL_ENV;
    process.env.MP_ACCESS_TOKEN="not-a-real-token";
    await assert.rejects(()=>adapter(request()),rejected("release_not_authorized"));
    assert.equal(hits,0);
  });
});
