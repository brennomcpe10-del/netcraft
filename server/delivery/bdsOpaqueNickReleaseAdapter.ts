/**
 * NetCraftBR private commercial nick transport adapter (UNMOUNTED CANDIDATE).
 *
 * Why this exists: @minecraft/server-net can send a SecretString header but
 * cannot calculate the existing Node HMAC without extracting that secret.
 * The private HTTPS gateway verifies the opaque header first and signs the
 * SAME canonical message inside the trusted server. Nonces are persisted by
 * authenticateBdsRequest in Firestore; the client does not supply an HMAC.
 *
 * IMPORTANT: no Production route mounts this adapter. A matching token
 * never proves payment approval: the commercial nick service re-verifies the
 * Orders API and the server-owned reward registry for every offer/ACK.
 */
import crypto from "node:crypto";
import {
  bdsSignature, type BdsSignedMessage,
} from "./bdsSignedRequest.ts";

type Action = BdsSignedMessage["action"];
export type OpaqueBridgeRequest = Readonly<{
  method: string;
  action: string;
  transportVerified: boolean; // trusted HTTPS adapter, never HTTP header
  body: string;
  headers: Readonly<Record<string, string | undefined>>;
}>;
export type NickBridgeService = Readonly<{
  authenticatedRequest: (
    msg: BdsSignedMessage, secureTransport:boolean,
  ) => Promise<unknown>;
}>;

const actions = new Set(["poll", "ack", "nack"]);
const KEY_ID="netcraft_nick_private";
const MAX_BYTES=4096;
const validNonce=/^[a-f0-9]{32}$/;
const validTimestamp=/^[0-9]{13}$/;
const isPrivateCommercial=()=>process.env.NODE_ENV==="production" &&
  (!process.env.VERCEL_ENV || process.env.VERCEL_ENV==="production") &&
  !process.env.FIRESTORE_EMULATOR_HOST &&
  process.env.NETCRAFT_DELIVERY_RELEASE_APPROVED==="PRIVATE_GATEWAY_REVIEWED" &&
  !!(process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN) &&
  !!(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

export class OpaqueNickBridgeBlocked extends Error {
  constructor(readonly reason:string){super(reason);}
}

/** Does not expose expected or received credentials in errors/logs. */
function matchingSecret(received:string|undefined, trusted:string) {
  if(typeof received!=="string" || !/^[A-Za-z0-9_-]{43,128}$/.test(received) ||
     !/^[A-Za-z0-9_-]{43,128}$/.test(trusted)) return false;
  const a=crypto.createHash("sha256").update(received).digest();
  const b=crypto.createHash("sha256").update(trusted).digest();
  return crypto.timingSafeEqual(a,b);
}

export function createOpaqueBdsNickReleaseAdapter(input:{
  service:NickBridgeService;
  secret:string; // server-owned only; NEVER browser, never BDS source control
  hmacKey:string; // distinct server-only key for existing HMAC contract
  now?:()=>number;
}) {
  const now=input.now ?? Date.now;
  if(typeof input.hmacKey!=="string" || Buffer.byteLength(input.hmacKey)<32 ||
     !/^[A-Za-z0-9_-]{43,128}$/.test(input.secret))
    throw new OpaqueNickBridgeBlocked("secure_bridge_configuration_required");
  return async (r:OpaqueBridgeRequest):Promise<unknown>=>{
    if(!isPrivateCommercial())throw new OpaqueNickBridgeBlocked("release_not_authorized");
    if(r?.transportVerified!==true || r?.method!=="POST" ||
       !actions.has(r?.action) || typeof r?.body!=="string" ||
       Buffer.byteLength(r.body,"utf8")>MAX_BYTES)
      throw new OpaqueNickBridgeBlocked("bad_bds_request");
    const headers=r.headers||{};
    const ts=headers["x-nc-timestamp"],nonce=headers["x-nc-nonce"];
    if(!validTimestamp.test(ts||"") || !validNonce.test(nonce||"") ||
       !Number.isSafeInteger(now()) ||
       Math.abs(Number(ts)-now())>60_000 ||
       !matchingSecret(headers["x-nc-bds-token"],input.secret))
      throw new OpaqueNickBridgeBlocked("unauthorized_bds_request");
    // Signed body is EXACTLY the received body: no JSON reserialization.
    const msg={action:r.action as Action,body:r.body};
    const signature=bdsSignature(input.hmacKey,msg,ts!,nonce!,KEY_ID);
    const signed:BdsSignedMessage={...msg,headers:{
      timestamp:ts!,nonce:nonce!,keyId:KEY_ID,signature,
    }};
    // Firestore nonce replay, provider re-verification, transactionally leased
    // jobs, idempotent ACK and manual-review NACK all stay in the service.
    return input.service.authenticatedRequest(signed,true);
  };
}
