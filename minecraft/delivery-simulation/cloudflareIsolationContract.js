// Pure contract checks for the isolated BDS → Cloudflare test channel.
// No Minecraft imports, secrets, timers, networking or delivery mutations.
const ID = /^[a-f0-9]{64}-\d{1,3}$/;
const PLAYER = /^[A-Za-z0-9_ ]{1,32}$/;
const NONCE = /^[a-f0-9]{32}$/;

export function validateTestPollInput(gamertag, nonce, timestamp, now) {
  if (typeof gamertag !== "string" || !PLAYER.test(gamertag)) return {ok:false,reason:"invalid_player"};
  if (typeof nonce !== "string" || !NONCE.test(nonce)) return {ok:false,reason:"invalid_nonce"};
  if (!/^\d{13}$/.test(String(timestamp)) || !Number.isFinite(now) ||
      Math.abs(now-Number(timestamp))>60000) return {ok:false,reason:"stale_timestamp"};
  return {ok:true};
}

export function interpretSandboxResponse(path, status, body) {
  if (path !== "/poll" && path !== "/ack") return {ok:false,reason:"unsupported_path"};
  if (path === "/ack") {
    // The Cloudflare isolation Worker deliberately NEVER acknowledges a delivery.
    return {ok:false,reason:status===409 ? "ack_disabled" : "ack_unavailable"};
  }
  if (status !== 200 || typeof body !== "string" || body.length > 8192)
    return {ok:false,reason:"http_rejected"};
  let result;
  try { result=JSON.parse(body); } catch { return {ok:false,reason:"invalid_json"}; }
  if (!result || result.simulation !== true || !Array.isArray(result.deliveries) ||
      result.deliveries.length !== 0) return {ok:false,reason:"unexpected_jobs"};
  return {ok:true,jobs:[],simulation:true};
}

export function safeOfflinePoll(isOnline, gamertag) {
  if (isOnline !== true) return {ok:false,reason:"offline"};
  if (typeof gamertag !== "string" || !PLAYER.test(gamertag))
    return {ok:false,reason:"invalid_player"};
  return {ok:true,gamertag};
}
// NEVER import into an active behavior pack without a separate integration review.
