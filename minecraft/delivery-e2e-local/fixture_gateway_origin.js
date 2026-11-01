// Clone-only remote fixture URL policy. Avoid global URL: BDS JS runtimes
// may omit browser URL constructors. Never permit IPs, ports or paths.
const LOOPBACK = 'https://127.0.0.1:18443';
const REMOTE = /^https:\/\/netcraft-delivery-fixture-clone-only\.[a-z0-9-]{1,63}\.workers\.dev\/?$/;
export function fixtureGatewayOrigin(value,remoteEnabled=false,cloneOnly=false) {
  if (remoteEnabled !== true) return LOOPBACK;
  if (cloneOnly !== true || typeof value !== 'string' ||
      value.length > 200 || !REMOTE.test(value))
    throw new Error('fixture_remote_origin_rejected');
  return value.endsWith('/') ? value.slice(0,-1) : value;
}
