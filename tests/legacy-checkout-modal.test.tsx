import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("legacy CheckoutModal cannot create unverified orders or write to Firestore", () => {
  const source = readFileSync(
    new URL("../src/components/modals/CheckoutModal.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /import \{ PixCheckout \} from/);
  assert.match(source, /<PixCheckout/);
  assert.match(source, /disabled=\{false\}/);
  for (const forbidden of [
    "saveOrderToFirestore", "createOrder(", "Math.random()",
    "TX-", "ORD-", "window.open(", "targetPixUrl",
    "targetLivePixUrl", "simulate-payment",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
