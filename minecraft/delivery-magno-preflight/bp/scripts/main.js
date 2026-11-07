// NetCraftBR / MagnoHost transport diagnostic. No dependency on NetCraftCore.
// OFF BY DEFAULT. Opt-in requires TWO separate non-secret server-admin flags.
// Network-only, no payment data, no player names, no tokens, no grants or ACK.
import {system} from "@minecraft/server";
import {variables} from "@minecraft/server-admin";
import {http,HttpRequest,HttpRequestMethod,HttpHeader} from "@minecraft/server-net";

const ENABLE="ncbr_magno_preflight_enabled";
const PREVIEW_ONLY="ncbr_magno_preflight_preview_only";
const ORIGIN="ncbr_magno_preflight_origin";
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
async function request(url,method,body){
  const req=new HttpRequest(url);
  req.method=method;
  req.timeout=7;
  req.headers=[new HttpHeader("Accept","application/json")];
  if(body!==undefined){
    req.headers.push(new HttpHeader("Content-Type","application/json"));
    req.body=body;
  }
  const result=await http.request(req);
  if(result.status!==200 || typeof result.body!=="string" ||
     result.body.length<2 || result.body.length>1024)
    throw Error("preflight_unavailable");
  const parsed=JSON.parse(result.body);
  return parsed;
}
async function runOnce(){
  let origin;
  try{
    if(variables.get(ENABLE)!==true ||
       variables.get(PREVIEW_ONLY)!==true){
      console.warn("[NCBR MAGNO PREFLIGHT] OFF");
      return;
    }
    origin=validateNetCraftPreviewOrigin(variables.get(ORIGIN));
  }catch{
    console.warn("[NCBR MAGNO PREFLIGHT] OFF");
    return;
  }
  try{
    check(await request(origin+PATH+"/health",HttpRequestMethod.Get),false);
    check(await request(origin+PATH+"/ping",HttpRequestMethod.Post,
      JSON.stringify({schema:1,probe:CONTRACT})),true);
    console.warn("[NCBR MAGNO PREFLIGHT] HTTPS_GET_POST_PASS_NO_DELIVERIES");
  }catch{
    // Never log full URLs, headers, exceptions or credentials.
    console.warn("[NCBR MAGNO PREFLIGHT] HTTPS_GET_POST_BLOCKED");
  }
}
// Run ONCE at startup. No intervals, event listeners, gamertags or commands.
system.run(()=>{void runOnce();});
