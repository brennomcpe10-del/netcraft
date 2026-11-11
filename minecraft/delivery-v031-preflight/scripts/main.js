// NetCraft Delivery v0.3.1 — independent CLONE-ONLY HTTPS preflight.
// Disabled by default. Does not poll the queue, write receipts, ACK, or grant rewards.
import { system } from '@minecraft/server';
import { variables, secrets } from '@minecraft/server-admin';
import { http, HttpRequest, HttpRequestMethod, HttpHeader } from '@minecraft/server-net';

const ORIGIN = 'https://127.0.0.1:18443';
const ENABLE = 'ncbr_pix_v031_preflight_enabled';
const SECRET = 'ncbr_pix_v031_preflight_token';
const PLAYER = 'ncbr_pix_v031_preflight_player';

function active() {
  try {
    return variables.get(ENABLE) === true &&
      variables.get('ncbr_pix_emulator_enabled') !== true &&
      variables.get('ncbr_e2e_lab_enabled') !== true;
  } catch { return false; }
}
function request(path, token, body, nonce) {
  if (path !== '/delivery/challenge' && path !== '/delivery/preflight')
    throw new Error('unapproved_route');
  const req = new HttpRequest(ORIGIN + path);
  req.method = HttpRequestMethod.Post;
  req.timeout = 5;
  req.body = JSON.stringify(body);
  req.headers = [
    new HttpHeader('Content-Type','application/json'),
    new HttpHeader('x-nc-bds-token',token)
  ];
  if (path === '/delivery/preflight') {
    req.headers.push(new HttpHeader('x-nc-nonce',nonce));
    req.headers.push(new HttpHeader('x-nc-timestamp',String(Date.now())));
  }
  return req;
}
async function probe() {
  if (!active()) { console.warn('[NCBR_PIX_V031] OFF'); return; }
  let token, player;
  try {
    token = secrets.get(SECRET);
    player = variables.get(PLAYER);
  } catch { console.warn('[NCBR_PIX_V031] CONFIG_MISSING'); return; }
  if (!token || typeof player !== 'string' ||
      !/^[A-Za-z0-9_ ]{1,32}$/.test(player) || player.trim() !== player) {
    console.warn('[NCBR_PIX_V031] CONFIG_INVALID');
    return;
  }
  try {
    const c = await http.request(request('/delivery/challenge', token, {}));
    if (c.status !== 200 || typeof c.body !== 'string' || c.body.length > 512)
      throw new Error('challenge_failed');
    const challenge = JSON.parse(c.body);
    if (challenge?.simulation !== true ||
        challenge?.environment !== 'verified_pix_emulator' ||
        !/^[a-f0-9]{32}$/.test(challenge.nonce || ''))
      throw new Error('untrusted_challenge');
    if (!active()) return;
    const p = await http.request(request('/delivery/preflight',token,
      {gamertag:player},challenge.nonce));
    if (p.status !== 200 || typeof p.body !== 'string' || p.body.length > 512)
      throw new Error('preflight_failed');
    const result = JSON.parse(p.body);
    if (result?.simulation !== true ||
        result?.environment !== 'verified_pix_emulator' ||
        result?.dispatchEnabled !== false ||
        result?.grantsEnabled !== false ||
        result?.ackEnabled !== false || result?.ready !== true)
      throw new Error('preflight_untrusted');
    console.warn('[NCBR_PIX_V031] AUTHENTICATED_READ_ONLY_PREFLIGHT_PASS');
  } catch {
    // Never log token, player, request headers, response body or details.
    console.warn('[NCBR_PIX_V031] FAIL_CLOSED');
  }
}
system.run(() => { void probe(); });
// No world changes, player event handlers, intervals, receipts or grants.
