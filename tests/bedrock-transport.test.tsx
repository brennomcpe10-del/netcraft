import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore JS-only Bedrock-compatible simulation boundary
import { createBedrockDeliveryTransport } from "../minecraft/delivery-simulation/bedrockTransport.js";
const id = "a".repeat(64) + "-0";
test("Bedrock simulation boundary requires explicit test transport", () => {
  assert.throws(() => createBedrockDeliveryTransport({ simulation: false }));
  assert.throws(() => createBedrockDeliveryTransport({ simulation: true, post: async () => ({}) }));
});
test("Bedrock simulation polls safe fixtures, handles offline/retry and fail-closed ACK", async () => {
  const requests: string[] = [];
  let networkFail = false;
  const post = async (path: string) => {
    requests.push(path);
    if (networkFail) throw Error("disconnected");
    if (path === "/poll") return { status: 200, data: { deliveries: [{ id, kind: "vip", simulation: true }] }, verified: true };
    return { status: 200, data: { simulation: true, state: "simulated_complete" }, verified: true };
  };
  const bridge = createBedrockDeliveryTransport({ simulation: true, post, verify: (r: any) => r.verified === true });
  assert.equal((await bridge.poll("OfflinePlayer")).deliveries[0].id, id);
  assert.equal((await bridge.simulateAck(id)).ok, true);
  assert.equal((await bridge.simulateAck("not-a-delivery")).ok, false);
  networkFail = true;
  assert.equal((await bridge.poll("OfflinePlayer")).reason, "network_failure");
  assert.deepEqual(requests, ["/poll", "/ack", "/poll"]);
});
test("Bedrock simulation rejects invalid or unverified provider responses", async () => {
  const bad = createBedrockDeliveryTransport({ simulation: true,
    post: async () => ({ status: 200, data: { deliveries: [{ id, kind: "kit", simulation: false }] }, verified: true }),
    verify: (r: any) => r.verified === true });
  assert.equal((await bad.poll("Tester")).reason, "invalid_response");
  const unverified = createBedrockDeliveryTransport({ simulation: true,
    post: async () => ({ status: 200, data: { deliveries: [] } }),
    verify: (r: any) => r.verified === true });
  assert.equal((await unverified.poll("Tester")).reason, "unauthenticated_response");
});
