// BDS-only, local HTTPS loopback delivery E2E lab. Never include this script
// in the normal client addon: @minecraft/server-net is BDS-exclusive.
// Test payments, Worker/cloud origins and commercial dispatch remain OFF.
import { variables, secrets } from '@minecraft/server-admin';
import { http, HttpRequest, HttpRequestMethod, HttpHeader } from '@minecraft/server-net';
import { validateLabResponse, isAckableResult } from './bridge_protocol.js';

const ORIGIN = 'https://127.0.0.1:18443';
const ENABLE = 'ncbr_e2e_lab_enabled';
const TOKEN = 'ncbr_e2e_lab_token';
const active = new Set();
let started = false;

function post(path, body, token, challenge) {
  if (!['/delivery/challenge', '/delivery/poll', '/delivery/ack'].includes(path))
    throw new Error('route_denied');
  const req = new HttpRequest(ORIGIN + path);
  req.method = HttpRequestMethod.Post;
  req.timeout = 5;
  req.body = JSON.stringify(body);
  req.headers = [new HttpHeader('Content-Type', 'application/json'),
    new HttpHeader('x-nc-bds-token', token)];
  if (challenge) {
    req.headers.push(new HttpHeader('x-nc-timestamp', String(Date.now())));
    req.headers.push(new HttpHeader('x-nc-nonce', challenge));
  }
  return req;
}
async function challenge(token) {
  const response = await http.request(post('/delivery/challenge', {}, token));
  if (response.status !== 200 || typeof response.body !== 'string' || response.body.length > 512)
    throw new Error('challenge_rejected');
  const body = JSON.parse(response.body);
  if (body?.simulation !== true || body?.environment !== 'synthetic_local' ||
      !/^[a-f0-9]{32}$/.test(body.nonce || '')) throw new Error('challenge_invalid');
  return body.nonce;
}
function enabled() {
  try { return variables.get(ENABLE) === true; } catch { return false; }
}
async function syncPlayer(player, token, engine) {
  if (!player?.isValid || !/^[A-Za-z0-9_ ]{1,32}$/.test(player.name) || active.has(player.name)) return;
  active.add(player.name);
  try {
    if (!enabled() || !player.isValid) return;
    const nonce = await challenge(token);
    const reply = await http.request(post('/delivery/poll', {gamertag:player.name}, token, nonce));
    if (reply.status !== 200 || typeof reply.body !== 'string' || reply.body.length > 4096)
      throw new Error('poll_rejected');
    const jobs = validateLabResponse(JSON.parse(reply.body), player.name);
    if (!jobs) throw new Error('poll_invalid');
    for (const job of jobs) {
      if (!enabled() || !player.isValid) return;
      // A test server can only send a fixed lab fixture; the Core performs its
      // own canonical validation, inventory check, VIP lookup and receipt lock.
      const result = engine.execute(job);
      if (!isAckableResult(result)) {
        console.warn('[NETCRAFT_DELIVERY_E2E] HOLD_' + String(result?.status || 'UNKNOWN').toUpperCase());
        continue;
      }
      // ACK only AFTER persistent applied receipt or replay proof in the Core.
      const ackNonce = await challenge(token);
      const ack = await http.request(post('/delivery/ack',
        {deliveryId:job.id, result:'applied'}, token, ackNonce));
      if (ack.status !== 200 || typeof ack.body !== 'string' || ack.body.length > 512 ||
          JSON.parse(ack.body)?.acknowledged !== true ||
          JSON.parse(ack.body)?.deliveryId !== job.id) throw new Error('ack_rejected');
      console.warn('[NETCRAFT_DELIVERY_E2E] GRANTED_AND_ACKED');
    }
  } catch {
    // No token, player data, URL, raw provider text or headers in logs.
    console.warn('[NETCRAFT_DELIVERY_E2E] FAIL_CLOSED');
  } finally { active.delete(player.name); }
}
export function startNetCraftBdsLabBridge({world,system,engine}) {
  if (started) return;
  started = true;
  if (!enabled()) {
    console.warn('[NETCRAFT_DELIVERY_E2E] OFF');
    return;
  }
  let token;
  try { token = secrets.get(TOKEN); } catch { /* fail closed */ }
  if (!token) {
    console.warn('[NETCRAFT_DELIVERY_E2E] SECRET_MISSING');
    return;
  }
  console.warn('[NETCRAFT_DELIVERY_E2E] LAB_ACTIVE_LOCALHOST_ONLY');
  system.runInterval(() => {
    if (!enabled()) return;
    for (const p of world.getAllPlayers()) void syncPlayer(p, token, engine);
  }, 200);
}
