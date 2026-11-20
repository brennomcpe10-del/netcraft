import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-ignore -- test-only Worker module; never imported by the BDS behavior pack
import worker, { NonceGate } from "../sandbox/cloudflare/worker.mjs";
// @ts-ignore -- pure JavaScript offline protocol checks, no Minecraft runtime
import { interpretSandboxResponse, safeOfflinePoll } from "../minecraft/delivery-simulation/cloudflareIsolationContract.js";

const token = "GATE_C_SYNTHETIC_ONLY_" + "f".repeat(64);
const deliveryId = "c".repeat(64) + "-1";

test("Gate C: fully offline, in-memory protocol denies replay, expired tokens, deliveries and ACK", async (t) => {
  // Fail immediately if any code attempts an external fetch. The Worker handler
  // below is invoked directly, not through HTTP, and NonceGate uses a Map.
  const outbound = t.mock.method(globalThis, "fetch", () => {
    throw new Error("GATE_C_OUTBOUND_NETWORK_FORBIDDEN");
  });

  const kv = new Map<string, number>();
  const nonceGate = new NonceGate({
    storage: {
      kv: {
        get: (key: string) => kv.get(key),
        put: (key: string, value: number) => { kv.set(key, value); },
        delete: (key: string) => { kv.delete(key); },
      },
    },
  });

  const env = {
    NC_SANDBOX_ENABLED: "true",
    NC_CHALLENGE_REQUIRED: "true",
    NC_BDS_TEST_TOKEN: token,
    NONCE_GATE: {
      idFromName: () => "gate-c-local-only",
      get: () => ({
        fetch: (url: string, init: RequestInit) => nonceGate.fetch(new Request(url, init)),
      }),
    },
  };

  async function post(
    route: string,
    body: Record<string, unknown>,
    nonce = "",
    credential = token,
    timestamp = Date.now(),
  ): Promise<Response> {
    return worker.fetch(new Request("https://isolated.invalid" + route, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-nc-bds-token": credential,
        "x-nc-nonce": nonce,
        "x-nc-timestamp": String(timestamp),
      },
      body: JSON.stringify(body),
    }), env);
  }

  // No opt-in in the published configuration; no installed pack starts polling.
  assert.match(readFileSync("sandbox/cloudflare/wrangler.toml", "utf8"),
    /NC_SANDBOX_ENABLED\s*=\s*"false"/);
  const bdsEntry = readFileSync("minecraft/delivery-simulation/preflight-pack/scripts/main.js", "utf8");
  assert.doesNotMatch(bdsEntry, /http\.request|isolatedBedrockChallengePoll|secretHeaderProbe|delivery\/poll/);

  const disabled = await worker.fetch(new Request("https://isolated.invalid/delivery/poll", {
    method: "POST",
  }), { ...env, NC_SANDBOX_ENABLED: "false" });
  assert.equal(disabled.status, 503);

  const offlineGate = safeOfflinePoll(false, "OfflinePlayer");
  assert.deepEqual(offlineGate, { ok: false, reason: "offline" });

  // Authentication, time-window and unexpected nonce failures never succeed.
  const unknown = "a".repeat(32);
  assert.equal((await post("/delivery/poll", { gamertag: "OfflinePlayer" },
    unknown, "invalid-test-token")).status, 401);
  assert.equal((await post("/delivery/poll", { gamertag: "OfflinePlayer" },
    unknown, token, Date.now() - 120000)).status, 401);
  assert.equal((await post("/delivery/poll", { gamertag: "OfflinePlayer" },
    unknown, token, Date.now() + 120000)).status, 401);
  assert.equal((await post("/delivery/poll", { gamertag: "OfflinePlayer" },
    unknown)).status, 401);

  // Challenge is issued by the in-memory Worker and can be consumed once.
  const challenge = await post("/delivery/challenge", {});
  assert.equal(challenge.status, 200);
  const issued = await challenge.json() as { nonce: string; simulation: boolean };
  assert.equal(issued.simulation, true);
  assert.match(issued.nonce, /^[a-f0-9]{32}$/);

  const first = await post("/delivery/poll", { gamertag: "OfflinePlayer" }, issued.nonce);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { deliveries: [], simulation: true });
  assert.equal((await post("/delivery/poll", { gamertag: "OfflinePlayer" },
    issued.nonce)).status, 401);

  // No non-empty delivery response may be accepted by the BDS-side contract.
  assert.equal(interpretSandboxResponse("/poll", 200,
    JSON.stringify({ simulation: true, deliveries: [{ id: deliveryId, kind: "vip" }] })).reason,
    "unexpected_jobs");

  // Even with a freshly issued challenge, ACK is rejected by the Worker.
  const ackChallenge = await post("/delivery/challenge", {});
  assert.equal(ackChallenge.status, 200);
  const ackNonce = (await ackChallenge.json() as { nonce: string }).nonce;
  const ack = await post("/delivery/ack", { deliveryId }, ackNonce);
  assert.equal(ack.status, 409);
  assert.deepEqual(await ack.json(), { error: "ack_disabled", simulation: true });

  // A forged success response must also fail at the consuming boundary.
  assert.equal(interpretSandboxResponse("/ack", 200,
    JSON.stringify({ simulation: true, state: "simulated_complete" })).reason,
    "ack_unavailable");
  assert.equal((await post("/delivery/seed", {}, "b".repeat(32))).status, 404);
  assert.equal((await post("/delivery/refund", {}, "b".repeat(32))).status, 404);

  assert.equal(outbound.mock.callCount(), 0,
    "Gate C must not make any external network requests");
});
