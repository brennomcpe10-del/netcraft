// Clone-only remote fixture URL policy. No private IP, localhost or arbitrary
// website can be configured for remote mode. Default remains TLS loopback.
const LOOPBACK = 'https://127.0.0.1:18443';
const HOST = /^netcraft-delivery-fixture-clone-only\.[a-z0-9-]{1,63}\.workers\.dev$/;
export function fixtureGatewayOrigin(value,remoteEnabled=false,cloneOnly=false) {
  if (remoteEnabled !== true) return LOOPBACK;
  if (cloneOnly !== true || typeof value !== 'string' || value.length > 200)
    throw new Error('fixture_remote_clone_only');
  let parsed;
  try { parsed=new URL(value); } catch { throw new Error('fixture_url_invalid'); }
  if (parsed.protocol !== 'https:' || !HOST.test(parsed.hostname) ||
      parsed.username || parsed.password || parsed.port || parsed.pathname !== '/' ||
      parsed.search || parsed.hash || parsed.href !== value + (value.endsWith('/')?'':'/'))
    throw new Error('fixture_remote_origin_rejected');
  return parsed.origin;
}
