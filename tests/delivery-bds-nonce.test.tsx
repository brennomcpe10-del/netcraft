import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
// @ts-ignore: Bedrock-safe ES module without TypeScript declarations
import { secureNonce32, safeTimestamp } from "../minecraft/delivery-simulation/secureNonce.js";

test("BDS nonce generation requires secure randomness and fails closed", () => {
  assert.throws(() => secureNonce32(undefined), /secure_random_unavailable/);
  assert.throws(() => secureNonce32({ getRandomValues: null }), /secure_random_unavailable/);
  const nonce = secureNonce32({ getRandomValues(array: Uint8Array) { array.set(randomBytes(array.length)); } });
  assert.match(nonce, /^[a-f0-9]{32}$/);
  assert.equal(nonce.length, 32);
  const distinct = new Set(Array.from({ length: 128 }, () =>
    secureNonce32({ getRandomValues(array: Uint8Array) { array.set(randomBytes(array.length)); } })));
  assert.equal(distinct.size, 128);
  assert.equal(createHash("sha256").update(nonce).digest("hex").length, 64);
});

test("BDS timestamp rejects broken clocks", () => {
  assert.equal(safeTimestamp(() => 1793370000000), 1793370000000);
  assert.throws(() => safeTimestamp(() => NaN), /clock_unavailable/);
  assert.throws(() => safeTimestamp(() => 1), /clock_unavailable/);
});
