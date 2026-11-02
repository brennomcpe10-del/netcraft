// Private delivery-service request authenticator. Not mounted on any public route.
// The HTTP/TLS adapter must independently enforce certificate/host policy.
// Reject a replay before accessing any delivery state; Redis/process memory is not enough.
import crypto from "node:crypto";
import type {Firestore} from "firebase-admin/firestore";

export type BdsSignedMessage = {
  action: "poll" | "ack" | "nack";
  body: string;
  headers: {
    timestamp: string;
    nonce: string;
    keyId: string;
    signature: string;
  };
};

export class BdsAuthError extends Error {
  constructor(readonly code: string) { super(code); }
}
const allowedActions = new Set(["poll", "ack", "nack"]);
const MAX_BODY_BYTES = 4096;
export const bdsBodyDigest = (body: string) =>
  crypto.createHash("sha256").update(body, "utf8").digest("hex");

export function bdsSignature(
  key: string, msg: Omit<BdsSignedMessage, "headers">,
  timestamp: string, nonce: string, keyId: string,
) {
  const canonical = ["netcraft-delivery-v1", keyId, "POST", msg.action,
    timestamp, nonce, bdsBodyDigest(msg.body)].join("\n");
  return crypto.createHmac("sha256", key).update(canonical).digest("hex");
}

export async function authenticateBdsRequest(
  db: Pick<Firestore, "collection" | "runTransaction">,
  message: BdsSignedMessage,
  secrets: Readonly<Record<string, string>>,
  now = Date.now(),
) {
  const h = message?.headers;
  if (!h || !allowedActions.has(message.action) ||
      typeof message.body !== "string" ||
      Buffer.byteLength(message.body, "utf8") > MAX_BODY_BYTES ||
      !/^[0-9]{13}$/.test(h.timestamp || "") ||
      !/^[a-f0-9]{32}$/.test(h.nonce || "") ||
      !/^[a-zA-Z0-9_-]{3,40}$/.test(h.keyId || "") ||
      !/^[a-f0-9]{64}$/.test(h.signature || "") ||
      !Number.isSafeInteger(now) ||
      Math.abs(Number(h.timestamp) - now) > 60_000)
    throw new BdsAuthError("invalid_authenticated_request");
  const key = secrets[h.keyId];
  if (typeof key !== "string" || Buffer.byteLength(key) < 32)
    throw new BdsAuthError("unauthorized");
  const expected = Buffer.from(
    bdsSignature(key, message, h.timestamp, h.nonce, h.keyId), "hex");
  const submitted = Buffer.from(h.signature, "hex");
  if (!crypto.timingSafeEqual(expected, submitted))
    throw new BdsAuthError("unauthorized");
  const receiptId = crypto.createHash("sha256")
    .update(h.keyId + ":" + h.nonce).digest("hex");
  const nonceRef = db.collection("pixCommercialDeliveryNonces").doc(receiptId);
  await db.runTransaction(async tx => {
    const prev = await tx.get(nonceRef);
    if (prev.exists) throw new BdsAuthError("replayed_request");
    tx.create(nonceRef, {
      keyId: h.keyId,
      issuedAt: Number(h.timestamp),
      expiresAt: new Date(now + 120_000),
    });
  });
  return {keyId: h.keyId, verified: true as const};
}
