// NOT imported by the pack entrypoint. No network activity or rewards.
// Prototype for a future separately authorized BDS test only.
// Importing this file does NOT initiate a request or read a secret.
import { secrets } from "@minecraft/server-admin";
import { HttpHeader } from "@minecraft/server-net";

const SECRET_NAME = "nc_delivery_homologation_header_token";
export function makeOpaqueTestAuthorizationHeader() {
  // SecretString is opaque; never stringify, interpolate, log or persist it.
  const secret = secrets.get(SECRET_NAME);
  if (!secret) return { ok: false, reason: "missing_server_secret" };
  // Actual SecretString + HttpHeader runtime compatibility remains UNVERIFIED.
  return { ok: true, header: new HttpHeader("x-nc-bds-token", secret) };
}
// No http.request, timers, event listeners, player modifications or grants.
// Never import this from scripts/main.js without a separate security review.
