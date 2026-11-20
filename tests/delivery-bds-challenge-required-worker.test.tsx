import {test} from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- isolated Worker
import worker,{NonceGate} from "../sandbox/cloudflare/worker.mjs";
const token="synthetic-test-token-0123456789abcdef0123456789abcdef";
function fixture(){
 const data=new Map<string,number>();
 const gate=new NonceGate({storage:{kv:{
  get:(k:string)=>data.get(k),put:(k:string,v:number)=>data.set(k,v),
  delete:(k:string)=>data.delete(k)
 }}});
 const env={NC_SANDBOX_ENABLED:"true",NC_CHALLENGE_REQUIRED:"true",
   NC_BDS_TEST_TOKEN:token,NONCE_GATE:{idFromName:()=> "one",get:()=>({fetch:(url:string,init:{method:string;body:string})=>gate.fetch(new Request(url,init))})}};
 const req=(path:string,nonce="",auth=token)=>
  new Request("https://isolated.invalid"+path,{method:"POST",
   headers:{"content-type":"application/json","x-nc-bds-token":auth,
    "x-nc-nonce":nonce,"x-nc-timestamp":String(Date.now())},
   body:JSON.stringify(path==="/delivery/ack"?{deliveryId:"a".repeat(64)+"-1"}:{gamertag:"OfflinePlayer"})});
 return {env,data,req};
}
test("challenge-required sandbox denies invented nonce, accepts issued once, blocks replay and ACK",async()=>{
 const {env,data,req}=fixture();
 assert.equal((await worker.fetch(req("/delivery/poll","f".repeat(32)),env)).status,401);
 const cr=await worker.fetch(req("/delivery/challenge"),env);
 assert.equal(cr.status,200);
 const {nonce}=await cr.json() as {nonce:string};
 assert.match(nonce,/^[a-f0-9]{32}$/);
 assert.equal(data.has("issued:"+nonce),true);
 const [first,second]=await Promise.all([
  worker.fetch(req("/delivery/poll",nonce),env),
  worker.fetch(req("/delivery/poll",nonce),env)
 ]);
 assert.deepEqual([first.status,second.status].sort(),[200,401]);
 assert.equal((await worker.fetch(req("/delivery/poll",nonce),env)).status,401);
 const ackChallenge=await worker.fetch(req("/delivery/challenge"),env);
 const ackNonce=(await ackChallenge.json() as {nonce:string}).nonce;
 assert.equal((await worker.fetch(req("/delivery/ack",ackNonce),env)).status,409);
});
test("expired challenge and disabled mode fail closed",async()=>{
 const {env,data,req}=fixture();
 const r=await worker.fetch(req("/delivery/challenge"),env);
 const {nonce}=await r.json() as {nonce:string};
 data.set("issued:"+nonce,Date.now()-61000);
 assert.equal((await worker.fetch(req("/delivery/poll",nonce),env)).status,401);
 assert.equal((await worker.fetch(req("/delivery/challenge"),{...env,NC_SANDBOX_ENABLED:"false"})).status,503);
 assert.equal((await worker.fetch(req("/delivery/challenge","","wrong"),env)).status,401);
});
