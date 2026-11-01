// CI-only Gate C HTTPS loopback: ephemeral certificate, trusted TLS, synthetic token.
// No external endpoints, Minecraft grants, ACK success, cloud deploy, or customer data.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import https from 'node:https';
import worker, { NonceGate } from '../sandbox/cloudflare/worker.mjs';

if (process.env.NODE_ENV !== 'test' || process.env.VERCEL_ENV ||
    process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.NC_SANDBOX_ENABLED === 'true') {
  throw new Error('Gate C HTTPS loopback must run in an isolated test environment');
}
assert.match(readFileSync('sandbox/cloudflare/wrangler.toml', 'utf8'),
  /NC_SANDBOX_ENABLED\s*=\s*"false"/);

const dir = mkdtempSync(join(tmpdir(), 'netcraft-gate-c-tls-'));
const certFile = join(dir, 'cert.pem');
const keyFile = join(dir, 'key.pem');
let server;

try {
  const generated = spawnSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyFile, '-out', certFile, '-days', '1',
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1',
  ], { encoding: 'utf8', timeout: 20000 });
  if (generated.status !== 0) throw new Error('Unable to generate ephemeral test TLS certificate');
  const cert = readFileSync(certFile);
  const key = readFileSync(keyFile);
  const token = randomBytes(32).toString('hex');
  const keys = new Map();
  const gate = new NonceGate({ storage: { kv: {
    get: (name) => keys.get(name),
    put: (name, value) => { keys.set(name, value); },
    delete: (name) => { keys.delete(name); },
  } } });
  const env = {
    NC_SANDBOX_ENABLED: 'true',
    NC_CHALLENGE_REQUIRED: 'true',
    NC_BDS_TEST_TOKEN: token,
    NONCE_GATE: {
      idFromName: () => 'gate-c-https-loopback',
      get: () => ({ fetch: (url, init) => gate.fetch(new Request(url, init)) }),
    },
  };

  server = https.createServer({ cert, key, minVersion: 'TLSv1.2' }, async (req, res) => {
    try {
      if (req.socket.remoteAddress !== '127.0.0.1' &&
          req.socket.remoteAddress !== '::ffff:127.0.0.1')
        throw new Error('Non-loopback client denied');
      const bodyParts = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 2048) {
          res.writeHead(413); res.end(); return;
        }
        bodyParts.push(chunk);
      }
      const incoming = new Request('https://isolated.invalid' + req.url, {
        method: req.method,
        headers: req.headers,
        ...(req.method !== 'GET' && req.method !== 'HEAD'
          ? { body: Buffer.concat(bodyParts) } : {}),
      });
      const response = await worker.fetch(incoming, env);
      const headers = Object.fromEntries(response.headers.entries());
      res.writeHead(response.status, headers);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500); res.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const call = (path, { nonce = '', credential = token,
    timestamp = Date.now(), data = {}, trusted = true, method = 'POST' } = {}) =>
    new Promise((resolve, reject) => {
      assert.match(path, /^\/(?:delivery\/(?:poll|ack|challenge|seed)|health)$/);
      const body = method === 'GET' ? undefined : JSON.stringify(data);
      const req = https.request({
        hostname: '127.0.0.1', port, path, method,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        ...(trusted ? { ca: cert } : {}),
        headers: method === 'GET' ? {} : {
          'content-type': 'application/json',
          'x-nc-bds-token': credential,
          'x-nc-nonce': nonce,
          'x-nc-timestamp': String(timestamp),
        },
        timeout: 5000,
      }, (response) => {
        const peerAuthorized = response.socket.authorized;
        const parts = [];
        response.on('data', chunk => parts.push(chunk));
        response.on('end', () => {
          const raw = Buffer.concat(parts).toString('utf8');
          let data;
          try { data = JSON.parse(raw); } catch { data = raw; }
          resolve({ status: response.statusCode, data, authorized: peerAuthorized });
        });
      });
      req.once('timeout', () => req.destroy(new Error('Loopback HTTPS timeout')));
      req.once('error', reject);
      req.end(body);
    });

  // TLS peer verification is mandatory; self-signed cert must fail without explicit trust.
  await assert.rejects(() => call('/health', { trusted: false, method: 'GET' }),
    /self.signed|certificate|verify/i);
  const health = await call('/health', { method: 'GET' });
  assert.equal(health.status, 200);
  assert.equal(health.authorized, true);
  assert.deepEqual(health.data, { environment: 'isolated_test', simulation: true, deliveryEnabled: false });

  assert.equal((await call('/delivery/challenge', { credential: 'incorrect' })).status, 401);
  const issue = async () => {
    const result = await call('/delivery/challenge');
    assert.equal(result.status, 200);
    assert.match(result.data.nonce, /^[a-f0-9]{32}$/);
    return result.data.nonce;
  };
  const nonce = await issue();
  assert.equal((await call('/delivery/poll', {
    nonce, data: { gamertag: 'OfflinePlayer' }, timestamp: Date.now() - 120000,
  })).status, 401);
  assert.equal((await call('/delivery/poll', {
    nonce, data: { gamertag: 'OfflinePlayer' }, credential: 'incorrect',
  })).status, 401);
  const poll = await call('/delivery/poll', { nonce, data: { gamertag: 'OfflinePlayer' } });
  assert.equal(poll.status, 200);
  assert.deepEqual(poll.data, { deliveries: [], simulation: true });
  assert.equal((await call('/delivery/poll', {
    nonce, data: { gamertag: 'OfflinePlayer' },
  })).status, 401);

  const ack = await call('/delivery/ack', {
    nonce: await issue(), data: { deliveryId: 'a'.repeat(64) + '-1' },
  });
  assert.equal(ack.status, 409);
  assert.deepEqual(ack.data, { error: 'ack_disabled', simulation: true });
  assert.equal((await call('/delivery/seed')).status, 404);

  console.log('PASS: Gate C isolated loopback HTTPS, verified TLS, token, replay, empty poll and ACK denied');
} finally {
  if (server?.listening)
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  rmSync(dir, { recursive: true, force: true });
}
