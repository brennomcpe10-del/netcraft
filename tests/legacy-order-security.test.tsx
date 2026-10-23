import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import express from "express";
import { once } from "node:events";
import { apiRouter } from "../server/routes/api.ts";

test("legacy checkout cannot create unverified orders, and historical orders require admin", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as any).port;
  const base = `http://127.0.0.1:${port}/api`;
  try {
    const checkout = await fetch(base + "/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyerNickname: "Player",
        recipientNickname: "Player",
        productId: "product",
        productType: "product",
        paymentMethod: "PIX",
      }),
    });
    assert.equal(checkout.status, 410);
    const responses = await Promise.all([
      fetch(base + "/orders"),
      fetch(base + "/orders/ORD-12345"),
      fetch(base + "/player/Player/orders"),
      fetch(base + "/admin/pix-test-orders"),
    ]);
    // Missing ADMIN_KEYWORD yields 503 (closed), configured admin yields 401.
    for (const response of responses)
      assert.ok([401, 403, 503].includes(response.status), `Unexpected public access: HTTP ${response.status}`);
    const simulation = await fetch(base + "/orders/ORD-12345/simulate-payment", {
      method: "POST",
    });
    assert.equal(simulation.status, 410);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("Firestore rules deny public order and provider test record access", () => {
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  for (const collection of ["orders", "pixTestOrders", "pixTestDeliveries", "pixTestCouponUsage", "coupons"]) {
    const block = rules.match(new RegExp(`match /${collection}/\\{[^}]+\\} \\{([\\s\\S]*?)\\}`));
    assert.ok(block, `Missing security policy: ${collection}`);
    assert.match(block[1], /allow read, write: if false;/);
  }
});
