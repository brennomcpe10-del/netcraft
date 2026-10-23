import { test } from "node:test";
import assert from "node:assert/strict";
import { testOrderSummary } from "../server/payments/adminTestOrders.ts";

test("admin sandbox summary excludes all checkout secrets and reward payloads", () => {
  const raw = {
    state: "approved",
    gamertag: "Halzin5212",
    totalCents: 990,
    createdAt: "2026-10-23T22:00:00.000Z",
    approvedAt: null,
    approvalObservedAt: "2026-10-23T22:00:14.000Z",
    providerOrderId: "ORD-sandbox-test",
    expiresAt: "2026-10-23T23:00:00.000Z",
    lines: [{ reward: { command: "give" }, productId: "kit" }],
    email: "private@example.com",
    cpf: "12345678901",
    qrCode: "SENSITIVE_PIX_PAYLOAD",
    qrBase64: "SECRET_IMAGE",
    requestHash: "SECRET_REQUEST_FINGERPRINT",
  };
  const result = testOrderSummary("a".repeat(64), raw);
  assert.equal(result.state, "approved");
  assert.equal(result.totalCents, 990);
  assert.equal(result.environment, "test");
  assert.equal(result.linesCount, 1);
  assert.equal(result.approvedAt, null);
  assert.equal(result.approvalObservedAt, raw.approvalObservedAt);
  assert.equal(result.expiresAt, raw.expiresAt);
  for (const field of ["email", "cpf", "qrCode", "qrBase64", "requestHash", "lines"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(result, field), false, field);
  }
  assert.ok(!JSON.stringify(result).includes("SENSITIVE_PIX_PAYLOAD"));
  assert.ok(!JSON.stringify(result).includes("private@example.com"));
});

test("sandbox summary never represents malformed provider amounts or statuses as approved", () => {
  const result = testOrderSummary("test", {
    state: "arbitrary-provider-text",
    totalCents: "990",
    gamertag: "x".repeat(200),
    lines: [],
    email: "private@example.com",
  });
  assert.equal(result.state, "unknown");
  assert.equal(result.totalCents, 0);
  assert.equal(result.gamertag, "Jogador desconhecido");
  assert.equal(result.expiresAt, null);
});
