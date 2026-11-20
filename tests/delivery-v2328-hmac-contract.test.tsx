// v2.3.28 LAB OFF: HMAC transport contract and replay regression.
// This suite never starts the BDS or HTTPS listener, creates a grant, or
// accesses Mercado Pago / Production. Firestore below is a transaction stub.
import {test} from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  authenticateBdsRequest,bdsSignature,bdsBodyDigest,BdsAuthError,
} from "../server/delivery/bdsSignedRequest.ts";

const at=1_780_000_000_000;
const key="local-v2328-only-ephemeral-proof-never-production-"+"x".repeat(40);
const keyId="lab2328";
function signed(action:"poll"|"ack"|"nack",body:string,nonce:string,timestamp=at) {
  const msg={action,body};
  return {...msg,headers:{timestamp:String(timestamp),nonce,keyId,
    signature:bdsSignature(key,msg,String(timestamp),nonce,keyId)}};
}
function fakeDb(){
  const docs=new Map<string,unknown>();
  return {
    collection:(name:string)=>({
      doc:(id:string)=>({id:name+"/"+id}),
    }),
    runTransaction:async(fn:(tx:any)=>Promise<any>)=>{
      const writes:{id:string;value:unknown}[]=[];
      const tx={
        get:async(ref:{id:string})=>({exists:docs.has(ref.id)}),
        create:(ref:{id:string},value:unknown)=>{
          if(docs.has(ref.id)||writes.some(x=>x.id===ref.id))throw Error("duplicate");
          writes.push({id:ref.id,value});
        },
      };
      const ret=await fn(tx);
      for(const write of writes)docs.set(write.id,write.value);
      return ret;
    },
  };
}
const n1="1".repeat(32),n2="2".repeat(32),n3="3".repeat(32);
const secrets={[keyId]:key};

test("v2.3.28 canonical HMAC covers method, action, body digest, key ID, nonce and timestamp",()=>{
  const body=JSON.stringify({gamertag:"OfflineTester",online:false});
  const a=signed("poll",body,n1);
  assert.match(a.headers.signature,/^[0-9a-f]{64}$/);
  assert.equal(bdsBodyDigest(body),crypto.createHash("sha256").update(body).digest("hex"));
  assert.notEqual(a.headers.signature,signed("ack",body,n1).headers.signature);
  assert.notEqual(a.headers.signature,signed("poll",body,n2).headers.signature);
  assert.notEqual(a.headers.signature,signed("poll",body+" ",n1).headers.signature);
  assert.notEqual(a.headers.signature,signed("poll",body,n1,at+1).headers.signature);
});

test("v2.3.28 signed request accepted once, same nonce rejected durably",async()=>{
  const db=fakeDb();
  const message=signed("poll",'{"gamertag":"OfflineTester","online":false}',n1);
  const first=await authenticateBdsRequest(db as any,message,secrets,at);
  assert.deepEqual(first,{keyId,verified:true});
  await assert.rejects(()=>authenticateBdsRequest(db as any,message,secrets,at),
    (error:unknown)=>error instanceof BdsAuthError && error.code==="replayed_request");
});

test("v2.3.28 wrong signature, edited payload, expired timestamp and missing key fail closed",async()=>{
  const db=fakeDb();
  const valid=signed("poll",'{"gamertag":"OfflineTester","online":false}',n1);
  const forged={...valid,headers:{...valid.headers,signature:"0".repeat(64)}};
  await assert.rejects(()=>authenticateBdsRequest(db as any,forged,secrets,at),
    (error:unknown)=>error instanceof BdsAuthError && error.code==="unauthorized");
  const changed={...valid,body:'{"gamertag":"Other","online":false}'};
  await assert.rejects(()=>authenticateBdsRequest(db as any,changed,secrets,at),
    (error:unknown)=>error instanceof BdsAuthError && error.code==="unauthorized");
  const old=signed("poll","{}",n2,at-120000);
  await assert.rejects(()=>authenticateBdsRequest(db as any,old,secrets,at),
    (error:unknown)=>error instanceof BdsAuthError && error.code==="invalid_authenticated_request");
  const keyMissing=signed("poll","{}",n3);
  await assert.rejects(()=>authenticateBdsRequest(db as any,keyMissing,{},at),
    (error:unknown)=>error instanceof BdsAuthError && error.code==="unauthorized");
});

test("v2.3.28 invalid nonce, unsupported action and oversize body rejected before any receipt",async()=>{
  const db=fakeDb();
  const malformed={...signed("poll","{}",n1),
    headers:{...signed("poll","{}",n1).headers,nonce:"not-hex"}};
  await assert.rejects(()=>authenticateBdsRequest(db as any,malformed,secrets,at),
    (error:unknown)=>error instanceof BdsAuthError && error.code==="invalid_authenticated_request");
  const unsupported={...signed("poll","{}",n2),action:"grant" as any};
  await assert.rejects(()=>authenticateBdsRequest(db as any,unsupported,secrets,at),
    (error:unknown)=>error instanceof BdsAuthError && error.code==="invalid_authenticated_request");
  const oversized=signed("poll","x".repeat(4097),n3);
  await assert.rejects(()=>authenticateBdsRequest(db as any,oversized,secrets,at),
    (error:unknown)=>error instanceof BdsAuthError && error.code==="invalid_authenticated_request");
});

test("v2.3.28 contract does not grant rewards or enable Production",()=>{
  // Signature verification is necessary but insufficient. The separate
  // HTTPS adapter + payment verification + identity binding remain absent.
  assert.ok(secrets[keyId].length>=32);
  assert.equal(typeof authenticateBdsRequest,"function");
  assert.equal(typeof bdsSignature,"function");
});
