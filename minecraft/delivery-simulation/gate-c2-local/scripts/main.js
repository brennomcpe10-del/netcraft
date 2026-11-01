// Isolated BDS Gate C.2. Not part of the installed NetCraftCore or OFF preflight pack.
// Default OFF. Enable only in the disposable lab using a scoped server variable.
// No secret values in code, world data, manifest, logs, or console. No item grants or ACK.
import { system } from "@minecraft/server";
import { variables, secrets } from "@minecraft/server-admin";
import { http, HttpRequest, HttpRequestMethod, HttpHeader } from "@minecraft/server-net";

const ORIGIN = "https://127.0.0.1:18443";
const ENABLE = "nc_gate_c2_enabled";
const TOKEN = "nc_gate_c2_synthetic_token";

function makePost(path, body, token, nonce, timestamp) {
  if (path !== "/delivery/challenge" && path !== "/delivery/poll")
    throw new Error("route_not_allowed");
  const req = new HttpRequest(ORIGIN + path);
  req.method = HttpRequestMethod.Post;
  req.timeout = 5;
  req.body = JSON.stringify(body);
  req.headers = [
    new HttpHeader("Content-Type", "application/json"),
    new HttpHeader("x-nc-bds-token", token),
  ];
  if (path === "/delivery/poll") {
    req.headers.push(new HttpHeader("x-nc-nonce", nonce));
    req.headers.push(new HttpHeader("x-nc-timestamp", String(timestamp)));
  }
  return req;
}

async function runOnce() {
  // No operation without explicit activation AND a dedicated synthetic secret.
  let enabled = false;
  try { enabled = variables.get(ENABLE) === true; }
  catch { /* fail closed */ }
  if (!enabled) {
    console.warn("[GATE_C2_BDS] OFF");
    return;
  }

  let token;
  try { token = secrets.get(TOKEN); }
  catch { /* fail closed */ }
  if (!token) {
    console.warn("[GATE_C2_BDS] SECRET_NOT_CONFIGURED");
    return;
  }

  try {
    // The isolated server issues a cryptographically secure challenge.
    // The BDS never uses Math.random, nor invents a nonce.
    const challenge = await http.request(makePost("/delivery/challenge", {}, token));
    if (challenge.status !== 200 || typeof challenge.body !== "string" ||
        challenge.body.length > 512)
      throw new Error("challenge_rejected");
    const issued = JSON.parse(challenge.body);
    if (issued?.simulation !== true || typeof issued.nonce !== "string" ||
        !/^[a-f0-9]{32}$/.test(issued.nonce))
      throw new Error("invalid_challenge");

    const poll = makePost("/delivery/poll", { gamertag: "SyntheticLabOnly" },
      token, issued.nonce, Date.now());
    const first = await http.request(poll);
    if (first.status !== 200 || typeof first.body !== "string" ||
        first.body.length > 512)
      throw new Error("poll_rejected");
    const result = JSON.parse(first.body);
    if (result?.simulation !== true || !Array.isArray(result.deliveries) ||
        result.deliveries.length !== 0)
      throw new Error("unexpected_jobs");

    // Replay is expected to be denied by the local test server.
    // No reward/ACK is ever attempted, even if the server misbehaves.
    const replay = await http.request(poll);
    if (replay.status !== 401)
      throw new Error("replay_not_denied");
    console.warn("[GATE_C2_BDS] AUTHENTICATED_EMPTY_POLL_AND_REPLAY_PASS");
  } catch {
    // Never print exceptions, request headers, token, response body or URLs.
    console.warn("[GATE_C2_BDS] FAIL_CLOSED");
  }
}

system.run(() => { void runOnce(); });
// No timers, player listeners, commands, payments, deliveries, or ACK.
