// Future-only header/API capability probe; deliberately NOT imported by main.js.
// No configured URL, token, timer, or request. No side effects on import.
import { secrets } from "@minecraft/server-admin";
import { HttpHeader } from "@minecraft/server-net";

export function inspectOpaqueHeaderCompatibility() {
  // This function is never called by the OFF preflight pack.
  // The caller must explicitly supply a separate test-scoped secret name.
  // Never serialize, inspect, stringify, or log SecretString.
  return { supportedBySource: typeof HttpHeader === "function" &&
    typeof secrets?.get === "function", runtimeVerified: false };
}
// Runtime verification requires separately approved isolated BDS test; this
// source-level check is intentionally insufficient to authorize HTTP traffic.
