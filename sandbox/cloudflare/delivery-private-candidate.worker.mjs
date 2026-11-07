// NONDEPLOYED, PRIVATE, DISABLED commercial infrastructure shell.
// No public routes, secrets, payment providers or delivery execution.
const json=(status)=>new Response(JSON.stringify({
  error:"commercial_delivery_not_released",enabled:false,
  paymentsEnabled:false,dispatchEnabled:false,
}),{status,headers:{"content-type":"application/json",
  "cache-control":"no-store"}});
export default {
 async fetch(_request,env){
  // Even incorrect deployment cannot switch on this source code.
  if(env?.NC_DELIVERY_DEPLOYMENT_LOCK!=="OFF"||
     env?.NC_COMMERCIAL_DELIVERY_ENABLED!=="false"||
     env?.NC_REAL_PAYMENTS_ENABLED!=="false"||
     env?.NC_PRODUCTION_BDS_ENABLED!=="false")return json(503);
  return json(503);
 },
};
