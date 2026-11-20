// Tests the exact BP-overlay factory that matches Core 2.3.30's import.
// No BDS, merchant network, payments, rewards, game entities, or secrets.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
// @ts-ignore -- Bedrock-friendly JS intentionally has no declaration file
import {createNickBdsTransport}
  from "../minecraft/delivery-core-v2330-clone/overlay/scripts/delivery/nick_bds_transport.js";
const base="https://netcraft-ten.vercel.app/api/delivery/bds",NOW=1793992800000;
function mock(opts:{status?:number;tamper?:(x:any)=>any}={}){
  const secret=Object.freeze({type:"OpaqueBedrockSecretString"});
  const calls:any[]=[];
  let n=0;
  class HttpRequest{
    method:any;body:any;headers:any[]=[];timeout?:number;
    constructor(public uri:string){}
  }
  class HttpHeader{constructor(public key:string,public value:unknown){}}
  const http={request:async(req:any)=>{
    calls.push(req);
    if(req.uri.endsWith("/challenge")){
      const response={schema:1,nonce:(++n).toString(16).padStart(32,"0"),
        timestamp:String(NOW),simulation:false,dispatchEnabled:false};
      return {status:opts.status||200,body:JSON.stringify(opts.tamper?.(response)??response)};
    }
    return {status:200,body:JSON.stringify({
      schema:1,simulation:false,dispatchEnabled:false,deliveries:[],
    })};
  }};
  const client=createNickBdsTransport({http,HttpRequest,HttpHeader,
    HttpRequestMethod:{Post:"POST"},secret,baseUrl:base,clock:()=>NOW});
  return {client,calls,secret};
}
test("Core v2.3.30 public createNickBdsTransport uses one-time challenge for each poll",async()=>{
  const t=mock();
  for(let i=0;i<2;i++){
    const reply=await t.client.poll("Halzin5212");
    assert.deepEqual(reply,{schema:1,simulation:false,dispatchEnabled:false,deliveries:[]});
  }
  assert.deepEqual(t.calls.map(x=>x.uri.slice(base.length)),
    ["/challenge","/poll","/challenge","/poll"]);
  for(const r of t.calls){
    assert.strictEqual(r.headers.find((x:any)=>x.key==="x-nc-bds-token").value,t.secret);
  }
  const first=t.calls[1].headers.find((x:any)=>x.key==="x-nc-nonce").value;
  const second=t.calls[3].headers.find((x:any)=>x.key==="x-nc-nonce").value;
  assert.notEqual(first,second);
});
test("untrusted or invalid challenge never reaches polling or grants",async()=>{
  for(const tamper of [
    (x:any)=>({...x,nonce:"invalid"}),
    (x:any)=>({...x,dispatchEnabled:true}),
    (x:any)=>({...x,timestamp:String(NOW-61000)}),
    (x:any)=>({...x,simulation:true}),
  ]){
    const t=mock({tamper});
    await assert.rejects(()=>t.client.poll("Halzin5212"),/SECURE_CHALLENGE_UNAVAILABLE/);
    assert.equal(t.calls.length,1);
  }
});
test("overlay never uses Math.random, stores keys, or grants items",()=>{
  const prefix="minecraft/delivery-core-v2330-clone/overlay/scripts/delivery/";
  const entry=readFileSync(prefix+"nick_bds_transport.js","utf8");
  const challenge=readFileSync(prefix+"nick_bds_transport_challenge.js","utf8");
  assert.match(entry,/createNickBdsTransportChallenge as createNickBdsTransport/);
  assert.doesNotMatch(entry+challenge,/Math\.random|runInterval|addItem\(|grantDeliveryVIPLab|setDynamicProperty|APP_USR-|MERCADOPAGO_ACCESS_TOKEN/);
  assert.match(challenge,/challenge.*schema/);
  assert.match(challenge,/SECURE_CHALLENGE_UNAVAILABLE/);
});
