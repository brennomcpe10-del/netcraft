// NetCraft Delivery Bedrock test bootstrap — INERT by design.
// Not referenced by any behavior pack manifest. No network traffic or player effects.
// The BDS SecretString is an opaque HTTP header value and cannot sign arbitrary HMAC messages.
// Never attempt to coerce/log secrets.get(...) or copy a raw signing secret into this pack.
import { variables, secrets } from "@minecraft/server-admin";
import { http, HttpRequest, HttpRequestMethod, HttpHeader } from "@minecraft/server-net";
const ENABLED = false;
export function inspectSimulationPreflight() {
  if (!ENABLED) return { enabled: false, reason: "not_authorized_for_runtime" };
  // Intentionally no request: a private standalone sandbox and secure
  // authentication design must be reviewed before enabling this bootstrap.
  const secret = secrets.get("nc_delivery_test_header_token");
  const endpoint = variables.get("nc_delivery_test_origin");
  return { enabled: false, configured: Boolean(secret && endpoint), reason: "no_bds_hmac_secret_access" };
}
// Imported BDS API symbols are intentionally unused until a reviewed test build.
// HttpHeader accepts SecretString, but that is not equivalent to signing HMAC.
void http; void HttpRequest; void HttpRequestMethod; void HttpHeader;
