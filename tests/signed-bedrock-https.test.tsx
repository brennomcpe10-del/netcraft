import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
// @ts-ignore Bridge is a plain JavaScript module for isolated Bedrock tests
import { createSignedBedrockHttpsBridge } from "../minecraft/delivery-simulation/signedHttpsBridge.js";
const secret = "local-demo-hmac-secret-only-never-deploy";
const id = "a".repeat(64) + "-0";
test("signed Bedrock HTTPS bridge: disabled without explicit test dependencies", () => {
  assert.throws(() => createSignedBedrockHttpsBridge());
  assert.throws(() => createSignedBedrockHttpsBridge({ enabled: true }));
});
test("signed Bedrock HTTPS bridge signs poll + ACK and rejects unsafe results", async () => {
  const requests: any[] = [];
  class Request {
    constructor(public url: string) {}
    method = "";
    timeout = 0;
    body = "";
    headers: { key: string; value: string }[] = [];
  }
  const options = {
    enabled: true, simulation: true, origin: "https://demo.invalid",
    now: () => 1793370000000,
    nonce: () => "b".repeat(32),
    sign: async (message: string) => crypto.createHmac("sha256", secret).update(message).digest("hex"),
    methods: { Post: "POST" }, HttpRequest: Request,
    http: { request: async (request: Request) => {
      requests.push(request);
      const path = new URL(request.url).pathname.slice("/delivery".length);
      const header = (name: string) => request.headers.find(x => x.key === name)?.value;
      const expected = crypto.createHmac("sha256", secret).update(
        ["POST", path, header("x-nc-timestamp"), header("x-nc-nonce"), request.body].join("\n")).digest("hex");
      assert.equal(header("x-nc-signature"), expected);
      assert.equal(request.timeout, 5);
      return { status: 200, body: path === "/poll"
        ? JSON.stringify({ deliveries: [{ id, kind: "vip", simulation: true }] })
        : JSON.stringify({ simulation: true, state: "simulated_complete", duplicate: false }) };
    }},
  };
  const bridge = createSignedBedrockHttpsBridge(options);
  assert.equal((await bridge.poll("DemoPlayer")).jobs?.[0]?.id, id);
  assert.deepEqual(await bridge.simulatedAck(id), { ok: true, simulation: true, duplicate: false });
  assert.equal((await bridge.simulatedAck("invalid")).ok, false);
  assert.equal(requests.length, 2);
  const bad = createSignedBedrockHttpsBridge({ ...options,
    http: { request: async () => ({ status: 200, body: JSON.stringify({ deliveries: [{ id, kind: "vip", simulation: false }] }) }) } });
  assert.equal((await bad.poll("DemoPlayer")).reason, "invalid_jobs");
});
