import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {runInNewContext} from "node:vm";

const source=readFileSync(resolve("minecraft/delivery-simulation/preflight-pack/scripts/secretHeaderProbe.js"),"utf8");
function loadProbe(secrets:any,Header:any) {
  const code=source
    .replace(/^import .*;\s*$/gm,"")
    .replace("export function makeOpaqueTestAuthorizationHeader()","function makeOpaqueTestAuthorizationHeader()")
    +"\nmakeOpaqueTestAuthorizationHeader;";
  return runInNewContext(code,{secrets,HttpHeader:Header}) as ()=>any;
}
test("opaque BDS header probe passes SecretString reference, never coercing or logging it",()=>{
 const secret={toString(){throw new Error("SECRET_MUST_REMAIN_OPAQUE");}};
 let seen:any;
 class Header {
  name:string;
  value:any;
  constructor(name:string,value:any){seen=value;this.name=name;this.value=value;}
 }
 const probe=loadProbe({get:(name:string)=>name==="nc_delivery_homologation_header_token"?secret:null},Header);
 const result=probe();
 assert.equal(result.ok,true);
 assert.equal(result.header.name,"x-nc-bds-token");
 assert.equal(seen,secret);
});
test("opaque BDS header probe returns safe reasons for absent/throwing secret or HttpHeader",()=>{
 class Header {constructor(_name:string,_value:any){}}
 assert.equal(loadProbe({get:()=>null},Header)().reason,"missing_server_secret");
 assert.equal(loadProbe({get:()=>{throw Error("sensitive simulated internal detail")}},Header)().reason,"opaque_header_unavailable");
 class ThrowingHeader {constructor(){throw Error("sensitive simulated value")}}
 assert.equal(loadProbe({get:()=>({})},ThrowingHeader)().reason,"opaque_header_unavailable");
});
