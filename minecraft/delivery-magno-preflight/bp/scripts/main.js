// NetCraftBR / MagnoHost transport diagnostic. No dependency on NetCraftCore.
// OFF BY DEFAULT. Opt-in requires TWO separate server-admin flags AND one
// opaque, server-stored Vercel automation token. No token is embedded in code.
// Network-only: no payments, player names, grants, inventory or ACK.
import {system} from "@minecraft/server";
import {variables,secrets} from "@minecraft/server-admin";
import {http,HttpRequest,HttpRequestMethod,HttpHeader} from "@minecraft/server-net";

const ENABLE="ncbr_magno_preflight_enabled";
const PREVIEW_ONLY="ncbr_magno_preflight_preview_only";
const ORIGIN="ncbr_magno_preflight_origin";
const VERCEL_AUTOMATION_SECRET="ncbr_magno_vercel_preview_bypass";
const CONTRACT="netcraft.delivery.remote-preflight.v1";
const PATH="/api/delivery/remote-preflight";
const EXACT_PREVIEW_ORIGIN=/^https:\/\/netcraft-[a-z0-9-]{6,110}-brennomcpe10-dels-projects\.vercel\.app$/;

export function validateNetCraftPreviewOrigin(input){
  if(typeof input!=="string" || !EXACT_PREVIEW_ORIGIN.test(input))
    throw Error("preview_origin_not_allowed");
  return input;
}
function check(data,ping){
  if(!data || typeof data!=="object" || Array.isArray(data) ||
     data.schema!==1 || data.contract!==CONTRACT ||
     data.environment!=="preview" || data.transport!=="https" ||
     data.simulation!==true || data.realPayments!==false ||
     data.grantsEnabled!==false || data.ackEnabled!==false ||
     data.dispatchEnabled!==false || (ping && data.pingAccepted!==true))
    throw Error("unexpected_remote_delivery_contract");
}
async function request(url,method,body,opaqueSecret){
  const req=new HttpRequest(url);
  req.method=method;
  req.timeout=7;
  // Bedrock resolves SecretString only when sending the HTTPS request.
  // Do not convert it to a string, concatenate, inspect or log it.
  req.headers=[
    new HttpHeader("Accept","application/json"),
    new HttpHeader("x-vercel-protection-bypass",opaqueSecret),
  ];
  if(body!==undefined){
    req.headers.push(new HttpHeader("Content-Type","application/json"));
    req.body=body;
  }
  const result=await http.request(req);
  if(result.status===401 || result.status===403)
    throw Error("preview_access_protected");
  if(result.status===404)throw Error("preview_endpoint_missing");
  if(result.status!==200 || typeof result.body!=="string" ||
     result.body.length<2 || result.body.length>1024)
    throw Error("preflight_unavailable");
  const parsed=JSON.parse(result.body);
  return parsed;
}
async function runOnce(){
  let origin,opaqueSecret;
  try{
    if(variables.get(ENABLE)!==true ||
       variables.get(PREVIEW_ONLY)!==true){
      console.warn("[NCBR MAGNO PREFLIGHT] OFF");
      return;
    }
    // Fail closed before reading any credential if the origin is not an
    // approved NetCraftBR Preview deployment with HTTPS and no URL suffix.
    origin=validateNetCraftPreviewOrigin(variables.get(ORIGIN));
  }catch{
    console.warn("[NCBR MAGNO PREFLIGHT] OFF");
    return;
  }
  try{
    opaqueSecret=secrets.get(VERCEL_AUTOMATION_SECRET);
  }catch{}
  if(!opaqueSecret){
    console.warn("[NCBR MAGNO PREFLIGHT] BYPASS_SECRET_NOT_CONFIGURED");
    return;
  }
  try{
    check(await request(origin+PATH+"/health",HttpRequestMethod.Get,undefined,opaqueSecret),false);
    check(await request(origin+PATH+"/ping",HttpRequestMethod.Post,
      JSON.stringify({schema:1,probe:CONTRACT}),opaqueSecret),true);
    console.warn("[NCBR MAGNO PREFLIGHT] HTTPS_GET_POST_PASS_NO_DELIVERIES");
  }catch(error){
    // Log only a short, predefined status. Never reveal URLs, headers,
    // exceptions or any test/production credentials.
    const code=error?.message==="preview_access_protected"
      ?"PREVIEW_PROTECTED_401_403"
      :error?.message==="preview_endpoint_missing"
        ?"PREVIEW_ENDPOINT_404"
        :"HTTPS_GET_POST_BLOCKED";
    console.warn("[NCBR MAGNO PREFLIGHT] "+code);
  }
}
// Run ONCE at startup. No intervals, event listeners, gamertags or commands.
system.run(()=>{void runOnce();});
