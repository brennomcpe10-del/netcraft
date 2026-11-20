// Future BDS CLIENT SIGNING CONTRACT ONLY — no network, no startup hook.
// Deliberately not imported into the NetCraftCore production addon.
// Secrets must come from server-only SecretString; nonce must be supplied by
// a cryptographically secure source/challenge, never Math.random or timestamps.
import {sha256,hmacSha256Hex} from "./hmacSha256.js";
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
export function makeCommercialCandidateSignature({
  action,body,keyId,timestamp,nonce,readSecret,
}) {
  if(!["poll","ack","nack"].includes(action)||
     typeof body!=="string"||
     !/^[a-zA-Z0-9_-]{3,40}$/.test(keyId||"")||
     !/^[0-9]{13}$/.test(timestamp||"")||
     !/^[a-f0-9]{32}$/.test(nonce||"")||
     typeof readSecret!=="function")
    throw Error("invalid_bds_candidate_request");
  const secret=readSecret();
  if(typeof secret!=="string"||secret.length<32)
    throw Error("missing_server_only_secret");
  const canonical=[
    "netcraft-delivery-v1",keyId,"POST",action,
    timestamp,nonce,hex(sha256(body)),
  ].join("\n");
  return hmacSha256Hex(secret,canonical);
}
