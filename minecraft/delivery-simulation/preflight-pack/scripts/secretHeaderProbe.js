// NOT imported by the pack entrypoint. No network activity or rewards.
// Prototype for a future separately authorized BDS test only.
// Importing this file does NOT initiate a request or read a secret.
import { secrets } from "@minecraft/server-admin";
import { HttpHeader } from "@minecraft/server-net";

const SECRET_NAME = "nc_delivery_homologation_header_token";
export function makeOpaqueTestAuthorizationHeader() {
  // SecretString is opaque; never stringify, interpolate, log or persist it.
  try {
    const secret = secrets.get(SECRET_NAME);
    if (!secret) return { ok: false, reason: "missing_server_secret" };
    // Only construct an opaque header; never emit an HTTP request or serialize it.
    return { ok: true, header: new HttpHeader("x-nc-bds-token", secret) };
  } catch {
    // Do not propagate runtime exceptions that might contain credential details.
    return { ok: false, reason: "opaque_header_unavailable" };
  }
}
// No http.request, timers, event listeners, player modifications or grants.
// Never import this from scripts/main.js without a separate security review.
