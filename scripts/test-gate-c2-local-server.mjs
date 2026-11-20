// Offline isolated Gate C.2 HTTPS protocol verification. No BDS, public URL, or rewards.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import https from 'node:https';

if (process.env.NODE_ENV !== 'test' || process.env.VERCEL_ENV ||
    process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.NC_SANDBOX_ENABLED === 'true')
  throw new Error('Gate C.2 CI requires isolated test configuration');

const require = createRequire(import.meta.url);
const { createGateC2Server } = require('./gate-c2-local-server.cjs');
const temp = mkdtempSync(join(tmpdir(), 'netcraft-gate-c2-'));
const keyPath = join(temp, 'key.pem'), certPath = join(temp, 'cert.pem');
let server;

try {
  const makeCert = spawnSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', certPath, '-days', '1',
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1',
  ], { encoding: 'utf8', timeout: 20000 });
  if (makeCert.status !== 0) throw new Error('Cannot issue isolated test certificate');

  const cert = readFileSync(certPath), key = readFileSync(keyPath);
  const token = randomBytes(32).toString('hex');
  server = createGateC2Server({ cert, key, token });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const call = (path, { method = 'POST', credential = token, nonce = '',
    timestamp = Date.now(), body = {}, trusted = true } = {}) =>
    new Promise((resolve, reject) => {
      const req = https.request({
        hostname: '127.0.0.1', port: server.address().port,
        path, method, minVersion: 'TLSv1.2', rejectUnauthorized: true,
        ...(trusted ? { ca: cert } : {}),
        headers: method === 'GET' ? {} : {
          'content-type': 'application/json',
          'x-nc-bds-token': credential,
          'x-nc-timestamp': String(timestamp),
          'x-nc-nonce': nonce,
        },
        timeout: 5000,
      }, response => {
        const chunks = [];
        const authorized = response.socket.authorized;
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data;
          try { data = JSON.parse(raw); } catch { data = raw; }
          resolve({ status: response.statusCode, data, authorized });
        });
      });
      req.once('error', reject);
      req.once('timeout', () => req.destroy(new Error('loopback timeout')));
      req.end(method === 'GET' ? undefined : JSON.stringify(body));
    });

  await assert.rejects(
    call('/health', { method: 'GET', trusted: false }), /certificate|verify|self.signed/i);
  const health = await call('/health', { method: 'GET' });
  assert.equal(health.status, 200);
  assert.equal(health.authorized, true);
  assert.deepEqual(health.data,
    { simulation: true, deliveriesEnabled: false, ackEnabled: false });
  assert.equal((await call('/delivery/challenge', { credential: 'invalid' })).status, 401);
  const issued = await call('/delivery/challenge');
  assert.equal(issued.status, 200);
  assert.equal(issued.data.simulation, true);
  assert.match(issued.data.nonce, /^[a-f0-9]{32}$/);

  const payload = { body: { gamertag: 'SyntheticLabOnly' }, nonce: issued.data.nonce };
  assert.equal((await call('/delivery/poll', { ...payload, timestamp: Date.now()-120000 })).status,401);
  assert.equal((await call('/delivery/poll', { ...payload, credential: 'invalid' })).status,401);
  assert.equal((await call('/delivery/poll', { ...payload, body: { gamertag: 'Unknown' } })).status,400);
  const poll = await call('/delivery/poll', payload);
  assert.equal(poll.status, 200);
  assert.deepEqual(poll.data, { simulation: true, deliveries: [] });
  assert.equal((await call('/delivery/poll', payload)).status, 401);
  const ackChallenge = await call('/delivery/challenge');
  assert.equal((await call('/delivery/ack', {nonce: ackChallenge.data.nonce,
    body: { deliveryId: 'a'.repeat(64) + '-1' }})).status, 409);
  assert.equal((await call('/delivery/seed')).status, 404);
  assert.equal((await call('/delivery/refund')).status, 404);

  console.log('PASS: Gate C.2 isolated verified HTTPS auth, challenge, zero jobs, replay and ACK denied');
} finally {
  if (server?.listening)
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  rmSync(temp, { recursive: true, force: true });
}
