import {test} from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- standalone Worker Durable Object
import {NonceGate} from "../sandbox/cloudflare/worker.mjs";
function gate(){
 const m=new Map<string,number>();
 const g=new NonceGate({storage:{kv:{
   get:(k:string)=>m.get(k),put:(k:string,v:number)=>m.set(k,v),
   delete:(k:string)=>m.delete(k)
 }}});
 const action=(nonce:string,operation:string,requireIssued=true)=>
   g.fetch(new Request("https://internal/claim",{method:"POST",
     body:JSON.stringify({nonce,operation,requireIssued})}));
 return {action,m};
}
test("issued challenge is consumed exactly once, concurrent claims cannot both succeed",async()=>{
 const {action}=gate(),nonce="a".repeat(32);
 assert.equal((await action(nonce,"issue")).status,200);
 const [a,b]=await Promise.all([action(nonce,"claim"),action(nonce,"claim")]);
 assert.deepEqual([a.status,b.status].sort(),[200,409]);
 assert.equal((await action(nonce,"claim")).status,409);
});
test("unknown and expired challenges fail closed without consuming nonce",async()=>{
 const {action,m}=gate(),nonce="b".repeat(32);
 assert.equal((await action(nonce,"claim")).status,410);
 assert.equal((await action(nonce,"issue")).status,200);
 m.set("issued:"+nonce,Date.now()-61000);
 assert.equal((await action(nonce,"claim")).status,410);
 assert.equal(m.has("nonce:"+nonce),false);
});
test("legacy claim remains separately available for explicitly disabled challenge mode",async()=>{
 const {action}=gate(),nonce="c".repeat(32);
 assert.equal((await action(nonce,"claim",false)).status,200);
 assert.equal((await action(nonce,"claim",false)).status,409);
});
