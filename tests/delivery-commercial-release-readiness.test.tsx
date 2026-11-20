import test from "node:test";
import assert from "node:assert/strict";
import {inspectCommercialReleasePreflight}
  from "../server/delivery/commercialReleaseReadiness.ts";

const configured={
  NODE_ENV:"production",VERCEL_ENV:"production",
  NETCRAFT_DELIVERY_RELEASE_APPROVED:"PRIVATE_GATEWAY_REVIEWED",
  NCBR_COMMERCIAL_CHECKOUT_APPROVED:"REVIEWED_LIVE_PIX",
  NCBR_COMMERCIAL_FIREBASE_ISOLATED:"true",
  NCBR_COMMERCIAL_MP_ACCESS_TOKEN:"REDACTED",
  NCBR_COMMERCIAL_MP_WEBHOOK_SECRET:"REDACTED",
  NCBR_COMMERCIAL_FIREBASE_SERVICE_ACCOUNT_JSON:"REDACTED",
  NCBR_COMMERCIAL_FIREBASE_PROJECT_ID:"REDACTED",
  NCBR_COMMERCIAL_REWARD_RULES_JSON:"REDACTED",
  NCBR_COMMERCIAL_APPROVED_PRICES_JSON:"REDACTED",
  NCBR_COMMERCIAL_BDS_TOKEN:"REDACTED",
  NCBR_COMMERCIAL_PRIVATE_HMAC_KEY:"REDACTED",
  NCBR_COMMERCIAL_GAME_LINK_HASH_SECRET:"REDACTED",
};
test("readiness identifies missing private BDS, pairing and checkout release settings",()=>{
  const env={...configured};
  for(const key of ["NCBR_COMMERCIAL_BDS_TOKEN",
    "NCBR_COMMERCIAL_PRIVATE_HMAC_KEY",
    "NCBR_COMMERCIAL_GAME_LINK_HASH_SECRET",
    "NETCRAFT_DELIVERY_RELEASE_APPROVED"] as const)delete (env as any)[key];
  const status=inspectCommercialReleasePreflight(env);
  assert.equal(status.status,"blocked");
  assert.equal(status.commercialEnabled,false);
  assert.deepEqual(status.missing,[
    "NCBR_COMMERCIAL_BDS_TOKEN","NCBR_COMMERCIAL_GAME_LINK_HASH_SECRET",
    "NCBR_COMMERCIAL_PRIVATE_HMAC_KEY","NETCRAFT_DELIVERY_RELEASE_APPROVED"]);
});
test("preflight never authorizes commerce, even if every key is present",()=>{
  const status=inspectCommercialReleasePreflight(configured);
  assert.equal(status.status,"configuration_complete_review_required");
  assert.equal(status.commercialEnabled,false);
  assert.equal(status.releaseApproved,false);
  assert.equal(status.minecraftContacted,false);
  assert.equal(status.providerContacted,false);
  assert.deepEqual(status.missing,[]);
  assert.equal(JSON.stringify(status).includes("REDACTED"),false);
});
test("preview, emulator and wrong release values always block",()=>{
  const p=inspectCommercialReleasePreflight({...configured,
    VERCEL_ENV:"preview",FIRESTORE_EMULATOR_HOST:"127.0.0.1:8080",
    NCBR_COMMERCIAL_CHECKOUT_APPROVED:"true"});
  assert.equal(p.environment,"preview");
  assert.ok(p.missing.includes("production_runtime"));
  assert.ok(p.missing.includes("firestore_emulator_must_be_off"));
  assert.ok(p.missing.includes("NCBR_COMMERCIAL_CHECKOUT_APPROVED"));
  assert.equal(p.commercialEnabled,false);
});
