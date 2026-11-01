import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const dir = "minecraft/delivery-simulation/gate-c2-local/";
const manifest = JSON.parse(readFileSync(dir + "manifest.json", "utf8"));
const source = readFileSync(dir + "scripts/main.js", "utf8");

test("Gate C.2 local probe has unique ID, localhost-only origin and no grants", () => {
  assert.equal(manifest.header.name, "NetCraft Delivery Gate C.2 Local OFF");
  assert.equal(manifest.modules[0].entry, "scripts/main.js");
  assert.notEqual(manifest.header.uuid, manifest.modules[0].uuid);
  assert.equal(manifest.modules[0].uuid, "8c5efdab-2f90-4d8d-9dc7-9b1bb49ac3fa");
  assert.deepEqual(manifest.dependencies.map((d: { module_name: string }) => d.module_name),
    ["@minecraft/server", "@minecraft/server-admin", "@minecraft/server-net"]);
  assert.match(source, /const ORIGIN = "https:\/\/127\.0\.0\.1:18443"/);
  assert.match(source, /variables\.get\(ENABLE\) === true/);
  assert.match(source, /secrets\.get\(TOKEN\)/);
  assert.match(source, /new HttpHeader\("x-nc-bds-token", token\)/);
  assert.doesNotMatch(source, /Math\.random|runInterval|runTimeout|playerSpawn|world\.|runCommand|addItem|grantVIP|\/delivery\/ack|http:\/\//i);
  assert.match(source, /result\.deliveries\.length !== 0/);
});

async function simulate(enabled: boolean, secret: object | undefined,
                        httpResponses: { status: number; body?: string }[] = []) {
  const logs: string[] = [];
  const requests: { uri: string; method: string; body: string; headers: { key: string; value: unknown }[] }[] = [];
  const tokenReads: string[] = [];
  class MockHeader {
    constructor(public key: string, public value: unknown) {}
  }
  class MockRequest {
    method = "";
    body = "";
    timeout = 0;
    headers: MockHeader[] = [];
    constructor(public uri: string) {}
  }
  const code = source.replace(/^import .*?;\s*$/gm, "");
  assert.doesNotMatch(code, /^import\s/m);
  runInNewContext(code, {
    system: { run: (callback: () => void) => callback() },
    variables: { get: (name: string) => name === "nc_gate_c2_enabled" ? enabled : undefined },
    secrets: { get: (name: string) => { tokenReads.push(name); return secret; } },
    http: {
      request: async (req: { uri: string; method: string; body: string; headers: MockHeader[] }) => {
        requests.push({ uri: req.uri, method: req.method, body: req.body, headers: req.headers });
        const next = httpResponses[requests.length - 1];
        if (!next) throw new Error("Unexpected test request");
        return next;
      },
    },
    HttpRequest: MockRequest,
    HttpHeader: MockHeader,
    HttpRequestMethod: { Post: "POST" },
    console: { warn: (value: string) => { logs.push(value); } },
  });
  await new Promise<void>(resolve => setImmediate(resolve));
  return { logs, requests, tokenReads };
}

test("Gate C.2 with default OFF cannot read a secret or make a network request", async () => {
  const result = await simulate(false, undefined);
  assert.deepEqual(result.requests, []);
  assert.deepEqual(result.tokenReads, []);
  assert.deepEqual(result.logs, ["[GATE_C2_BDS] OFF"]);
});

test("Gate C.2 fails closed without synthetic server-admin secret", async () => {
  const result = await simulate(true, undefined);
  assert.deepEqual(result.requests, []);
  assert.deepEqual(result.tokenReads, ["nc_gate_c2_synthetic_token"]);
  assert.deepEqual(result.logs, ["[GATE_C2_BDS] SECRET_NOT_CONFIGURED"]);
});

test("Gate C.2 mock passes opaque SecretString only to HTTPS headers and denies replay", async () => {
  const secret = { toString() { throw new Error("Opaque secret must never be coerced"); } };
  const challenge = "f".repeat(32);
  const result = await simulate(true, secret, [
    { status: 200, body: JSON.stringify({ simulation: true, nonce: challenge }) },
    { status: 200, body: JSON.stringify({ simulation: true, deliveries: [] }) },
    { status: 401, body: JSON.stringify({ error: "replay" }) },
  ]);
  assert.deepEqual(result.logs, ["[GATE_C2_BDS] AUTHENTICATED_EMPTY_POLL_AND_REPLAY_PASS"]);
  assert.equal(result.requests.length, 3);
  assert.deepEqual(result.requests.map(r => r.uri), [
    "https://127.0.0.1:18443/delivery/challenge",
    "https://127.0.0.1:18443/delivery/poll",
    "https://127.0.0.1:18443/delivery/poll",
  ]);
  for (const req of result.requests) {
    assert.equal(req.method, "POST");
    assert.equal(req.headers.find(h => h.key === "x-nc-bds-token")?.value, secret);
  }
  assert.equal(result.requests[1].headers.find(h => h.key === "x-nc-nonce")?.value, challenge);
  assert.equal(JSON.parse(result.requests[1].body).gamertag, "SyntheticLabOnly");
});

test("Gate C.2 rejects any nonempty delivery response and never invokes ACK", async () => {
  const secret = { opaque: true };
  const result = await simulate(true, secret, [
    { status: 200, body: JSON.stringify({ simulation: true, nonce: "a".repeat(32) }) },
    { status: 200, body: JSON.stringify({ simulation: true, deliveries: [{ id: "not-real" }] }) },
  ]);
  assert.deepEqual(result.logs, ["[GATE_C2_BDS] FAIL_CLOSED"]);
  assert.equal(result.requests.length, 2);
  assert.equal(result.requests.every(r => !r.uri.endsWith("/ack")), true);
});
