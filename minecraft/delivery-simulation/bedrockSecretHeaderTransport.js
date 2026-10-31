// Test-only BDS transport. Not referenced by an installed behavior pack.
// SecretString is opaque and passed straight into an HttpHeader.
// NEVER log, coerce or place the secret in source, variables or manifest.
import { secrets, variables } from "@minecraft/server-admin";
import { http, HttpRequest, HttpRequestMethod, HttpHeader } from "@minecraft/server-net";

const ID = /^[a-f0-9]{64}-\d{1,3}$/;
const PLAYER = /^[A-Za-z0-9_ ]{1,32}$/;
const HOST = /^https:\/\/[a-z0-9.-]+(?::443)?$/i;
let running = false;

export async function isolatedBedrockDemoRequest(path, input, nonce, timestamp) {
  // Deliberately not enabled without an external sandbox and separate review.
  if (variables.get("nc_delivery_test_enabled") !== true) return { ok: false, reason: "disabled" };
  if (path !== "/poll" && path !== "/ack") return { ok: false, reason: "not_allowed" };
  if (!/^[a-f0-9]{32}$/.test(nonce) || !/^\d{13}$/.test(String(timestamp)) ||
      Math.abs(Date.now() - Number(timestamp)) > 60000)
    return { ok: false, reason: "invalid_request" };
  if ((path === "/poll" && !PLAYER.test(input)) ||
      (path === "/ack" && !ID.test(input))) return { ok: false, reason: "invalid_data" };
  const origin = variables.get("nc_delivery_test_origin");
  const token = secrets.get("nc_delivery_test_header_token");
  if (typeof origin !== "string" || !HOST.test(origin) || !token || running)
    return { ok: false, reason: "not_configured_or_busy" };
  running = true;
  try {
    const req = new HttpRequest(origin + "/delivery" + path);
    req.method = HttpRequestMethod.Post;
    req.timeout = 5;
    req.body = JSON.stringify(path === "/poll" ? { gamertag: input } : { deliveryId: input });
    req.headers = [
      new HttpHeader("Content-Type", "application/json"),
      new HttpHeader("x-nc-bds-token", token),
      new HttpHeader("x-nc-nonce", nonce),
      new HttpHeader("x-nc-timestamp", String(timestamp)),
    ];
    const response = await http.request(req);
    // ACK never counts as success in this sandbox, even if a server replies 200.
    if (path === "/ack") return { ok: false, reason: "ack_disabled" };
    if (response.status !== 200 || typeof response.body !== "string" || response.body.length > 8192)
      return { ok: false, reason: "http_rejected" };
    let result;
    try { result = JSON.parse(response.body); }
    catch { return { ok: false, reason: "invalid_json" }; }
    // The Cloudflare isolation contract cannot authorize *any* delivery job.
    if (!result || result.simulation !== true || !Array.isArray(result.deliveries) ||
        result.deliveries.length !== 0)
      return { ok: false, reason: "unexpected_jobs" };
    return { ok: true, jobs: [], simulation: true };
  } catch {
    return { ok: false, reason: "transport_error" };
  } finally {
    running = false;
  }
}
// Deliberately no interval, join listener, console output or item grant.
// No package manifest imports this module. Do not distribute as a live addon.
