import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- Worker deliberately uses plain JavaScript
import sandbox, { NonceGate } from "../sandbox/cloudflare/worker.mjs";

const token = "simulated-worker-token-32-char-minimum-abc123";
const makeRequest = (route: string, nonce: string, options: { auth?: string; time?: number; body?: object } = {}) =>
  new Request("https://sandbox.example" + route, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-nc-bds-token": options.auth ?? token,
      "x-nc-timestamp": String(options.time ?? Date.now()),
      "x-nc-nonce": nonce,
    },
    body: JSON.stringify(options.body ?? (route === "/delivery/ack"
      ? { deliveryId: "a".repeat(64) + "-1" } : { gamertag: "OfflinePlayer" })),
  });

function storageHarness() {
  // Shared backing map models persistence after a DO instance is discarded.
  // This is a unit-test simulation, not a real workerd restart test.
  const records = new Map<string, number>();
  const ctx = {
    storage: {
      kv: {
        get: (key: string) => records.get(key),
        put: (key: string, value: number) => { records.set(key, value); },
      },
    },
  };
  let current = new NonceGate(ctx);
  const binding = {
    idFromName: (name: string) => name,
    get: () => ({
      fetch: (url: string, init: RequestInit) =>
        current.fetch(new Request(url, init)),
    }),
  };
  return {
    env: { NONCE_GATE: binding, NC_SANDBOX_ENABLED: "true", NC_BDS_TEST_TOKEN: token },
    restart: () => { current = new NonceGate(ctx); },
    count: () => records.size,
  };
}

test("NonceGate recognizes nonce after instance re-creation with shared durable backing", async () => {
  const fixture = storageHarness();
  const nonce = "1".repeat(32);
  const first = await sandbox.fetch(makeRequest("/delivery/poll", nonce), fixture.env);
  assert.equal(first.status, 200);
  assert.deepEqual((await first.json()).deliveries, []);
  fixture.restart();
  const repeated = await sandbox.fetch(makeRequest("/delivery/poll", nonce), fixture.env);
  assert.equal(repeated.status, 401);
  assert.deepEqual(await repeated.json(), { error: "replay" });
  assert.equal(fixture.count(), 1);
});

test("concurrent same-nonce claims accept only one and persist one record", async () => {
  const fixture = storageHarness();
  const nonce = "2".repeat(32);
  const attempts = await Promise.all(Array.from({ length: 24 }, () =>
    sandbox.fetch(makeRequest("/delivery/poll", nonce), fixture.env)));
  assert.equal(attempts.filter(r => r.status === 200).length, 1);
  assert.equal(attempts.filter(r => r.status === 401).length, 23);
  assert.equal(fixture.count(), 1);
});

test("invalid token and stale timestamp do not consume nonce", async () => {
  const fixture = storageHarness();
  const nonce = "3".repeat(32);
  assert.equal((await sandbox.fetch(makeRequest("/delivery/poll", nonce, { auth: "invalid" }), fixture.env)).status, 401);
  assert.equal((await sandbox.fetch(makeRequest("/delivery/poll", nonce, { time: Date.now()-120000 }), fixture.env)).status, 401);
  assert.equal(fixture.count(), 0);
  assert.equal((await sandbox.fetch(makeRequest("/delivery/poll", nonce), fixture.env)).status, 200);
});

test("ACK is always disabled, no test job is ever dispatched", async () => {
  const fixture = storageHarness();
  const ack = await sandbox.fetch(makeRequest("/delivery/ack", "4".repeat(32)), fixture.env);
  assert.equal(ack.status, 409);
  assert.deepEqual(await ack.json(), { error: "ack_disabled", simulation: true });
  const poll = await sandbox.fetch(makeRequest("/delivery/poll", "5".repeat(32)), fixture.env);
  assert.deepEqual(await poll.json(), { deliveries: [], simulation: true });
  const unauthorizedMutation = await sandbox.fetch(makeRequest("/delivery/refund", "6".repeat(32)), fixture.env);
  assert.equal(unauthorizedMutation.status, 404);
});
