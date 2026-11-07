/**
 * SERVER-SIDE ONLY commercial Delivery composition for a reviewed Vercel
 * Production release. In Preview this function always throws (NO charge).
 * Deliberately uses a NEW Firebase project, not the shared storefront database.
 * Nothing in this file auto-enables a checkout or mounts itself.
 */
import {initializeApp,getApps,cert} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {PixError} from "../payments/mercadoPago.ts";
import {firebaseConfig} from "../../src/lib/firebaseConfig.ts";
import {makeRewardRegistry,type RewardRule} from "./verifiedRewardRegistry.ts";
import {assertNetcraftVipOnlyCommercialRelease} from "./netcraftVipOnlyReleaseGuard.ts";
import type {CommercialApprovedPrice} from "./commercialCatalogReleaseApproval.ts";
import {createCommercialOrdersWriter} from "../payments/mercadoPagoCommercialWriter.ts";
import {createNetCraftCommercialCheckout} from "./commercialCheckoutService.ts";
import {createNetCraftCommercialNickGateway} from "./commercialNickGateway.ts";

function requireCommercialEnvironment(){
  if(process.env.NODE_ENV!=="production"||
     process.env.VERCEL_ENV!=="production"||
     !!process.env.FIRESTORE_EMULATOR_HOST||
     process.env.NETCRAFT_DELIVERY_RELEASE_APPROVED!=="PRIVATE_GATEWAY_REVIEWED"||
     process.env.NCBR_COMMERCIAL_CHECKOUT_APPROVED!=="REVIEWED_LIVE_PIX"||
     process.env.NCBR_COMMERCIAL_FIREBASE_ISOLATED!=="true")
    throw new PixError("commercial_release_not_configured",503);
}
function jsonEnv(name:string){
  try{
    const raw=process.env[name];
    if(!raw||raw.length>200_000)throw Error("missing_or_large");
    return JSON.parse(raw);
  }catch{throw new PixError("commercial_configuration_incomplete",503);}
}
export function createReviewedCommercialVercelRuntime(){
  requireCommercialEnvironment();
  const account=jsonEnv("NCBR_COMMERCIAL_FIREBASE_SERVICE_ACCOUNT_JSON");
  const project=process.env.NCBR_COMMERCIAL_FIREBASE_PROJECT_ID;
  if(!/^[a-z][a-z0-9-]{5,99}$/.test(project||"")||
     project===firebaseConfig.projectId||account?.project_id!==project||
     typeof account.private_key!=="string"||account.private_key.length<100||
     typeof account.client_email!=="string")
    throw new PixError("isolated_commercial_firestore_required",503);
  const appName="ncbr-commercial-delivery-production";
  const app=getApps().find(x=>x.name===appName)||
    initializeApp({projectId:project,credential:cert(account)},appName);
  const db=getFirestore(app);
  const rules=jsonEnv("NCBR_COMMERCIAL_REWARD_RULES_JSON") as RewardRule[];
  const prices=jsonEnv("NCBR_COMMERCIAL_APPROVED_PRICES_JSON") as CommercialApprovedPrice[];
  // A staging, test or accidental environment edit must never authorize
  // unknown kits, prices, tiers or rank destinations in commercial mode.
  assertNetcraftVipOnlyCommercialRelease(rules,prices);
  const registry=makeRewardRegistry(rules);
  const token=process.env.NCBR_COMMERCIAL_MP_ACCESS_TOKEN||"";
  const webhookSecret=process.env.NCBR_COMMERCIAL_MP_WEBHOOK_SECRET||"";
  const bdsOpaqueToken=process.env.NCBR_COMMERCIAL_BDS_TOKEN||"";
  const privateHmacKey=process.env.NCBR_COMMERCIAL_PRIVATE_HMAC_KEY||"";
  if(!/^APP_USR-[A-Za-z0-9-]{24,}$/.test(token)||
     webhookSecret.length<32||!/^[A-Za-z0-9_-]{43,128}$/.test(bdsOpaqueToken)||
     privateHmacKey.length<32)
    throw new PixError("commercial_merchant_or_bds_credentials_missing",503);
  const release=()=>{try{requireCommercialEnvironment();return true;}catch{return false;}};
  const provider=createCommercialOrdersWriter({accessToken:token,
    checkoutAuthorized:release});
  const checkout=createNetCraftCommercialCheckout({
    db,provider,registry,approvedPrices:prices,releaseApproved:release,
  });
  const delivery=createNetCraftCommercialNickGateway({
    db,provider,registry,approvedPrices:prices,
    bdsOpaqueToken,privateHmacKey,webhookSecret,
    authorizeOrderForDispatch:async order=>
      release()&&(order as any).checkoutOrigin==="netcraft_commercial_checkout_v1" &&
      typeof (order as any).requestHash==="string"&&
      /^[a-f0-9]{64}$/.test((order as any).requestHash),
  });
  return Object.freeze({db,checkout,delivery});
}
