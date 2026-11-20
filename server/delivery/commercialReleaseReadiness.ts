/**
 * Read-only internal preflight. It deliberately does not instantiate Firebase,
 * contact Mercado Pago/BDS, issue voucher codes, or enable any release switch.
 * Exposed only via the authenticated admin API.
 */
export type CommercialPreflight = Readonly<{
  environment:"production"|"preview"|"development";
  status:"blocked"|"configuration_complete_review_required";
  missing:string[];
  commercialEnabled:boolean;
  providerContacted:false;
  minecraftContacted:false;
  releaseApproved:false;
}>;
const provided=(v:unknown)=>typeof v==="string"&&v.trim().length>0;
const releaseConditions = [
  ["NETCRAFT_DELIVERY_RELEASE_APPROVED","PRIVATE_GATEWAY_REVIEWED"],
  ["NCBR_COMMERCIAL_CHECKOUT_APPROVED","REVIEWED_LIVE_PIX"],
  ["NCBR_COMMERCIAL_FIREBASE_ISOLATED","true"],
] as const;
const required = [
  "NCBR_COMMERCIAL_MP_ACCESS_TOKEN",
  "NCBR_COMMERCIAL_MP_WEBHOOK_SECRET",
  "NCBR_COMMERCIAL_FIREBASE_SERVICE_ACCOUNT_JSON",
  "NCBR_COMMERCIAL_FIREBASE_PROJECT_ID",
  "NCBR_COMMERCIAL_REWARD_RULES_JSON",
  "NCBR_COMMERCIAL_APPROVED_PRICES_JSON",
  "NCBR_COMMERCIAL_BDS_TOKEN",
  "NCBR_COMMERCIAL_PRIVATE_HMAC_KEY",
  "NCBR_COMMERCIAL_GAME_LINK_HASH_SECRET",
] as const;
export function inspectCommercialReleasePreflight(
  env:Readonly<Record<string,string|undefined>>,
):CommercialPreflight {
  const environment=env.VERCEL_ENV==="production"?"production":
    env.VERCEL_ENV==="preview"?"preview":"development";
  const missing:string[]=[];
  if(env.NODE_ENV!=="production"||environment!=="production")
    missing.push("production_runtime");
  if(provided(env.FIRESTORE_EMULATOR_HOST))
    missing.push("firestore_emulator_must_be_off");
  for(const [key,value] of releaseConditions)
    if(env[key]!==value)missing.push(key);
  for(const key of required)
    if(!provided(env[key]))missing.push(key);
  // Existence checks are NOT authenticity checks. Readiness can never approve
  // live payments; real provider, catalog, game executor and Firestore isolation
  // still require explicit human-supervised end-to-end homologation.
  return Object.freeze({
    environment,
    status:missing.length?"blocked":"configuration_complete_review_required",
    missing:Object.freeze(missing.sort()) as unknown as string[],
    commercialEnabled:false,
    providerContacted:false,minecraftContacted:false,releaseApproved:false,
  });
}
