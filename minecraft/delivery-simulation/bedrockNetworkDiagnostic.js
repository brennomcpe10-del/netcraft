// Optional BDS diagnostic module. NOT imported by the active addon.
// Requires @minecraft/server-net permission and a compatible BDS version.
// No payment tokens, signatures, player data, reward commands, or automatic startup.
import { http, HttpRequest, HttpRequestMethod } from "@minecraft/server-net";

const DISABLED = true;
export async function diagnoseHttps(options = {}) {
  if (DISABLED || options.enabled !== true) return { ok: false, reason: "disabled" };
  // For safety, no externally reachable URL is embedded in this build.
  // Replace only in a future dedicated TEST build with a fixed, audited URL.
  return { ok: false, reason: "no_test_endpoint_configured" };
}
// A separately reviewed test build can use this helper only after explicit enablement.
// It is intentionally unreachable from diagnoseHttps in this revision.
async function sendDiagnosticRequest(fixedHttpsUrl) {
  const request = new HttpRequest(fixedHttpsUrl);
  request.method = HttpRequestMethod.Get;
  request.timeout = 5;
  const response = await http.request(request);
  return { status: response.status, reachable: response.status >= 200 && response.status < 500 };
}
