import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { apiRouter } from "../server/routes/api.ts";
import { validateCartRequest, CartQuoteError } from "../src/lib/cartQuote.ts";

test("cart validator returns descriptive, typed client errors", () => {
  for (const lines of [
    undefined, null, [], [{ productType: "product", productId: "p", quantity: 0 }],
    [{ productType: "vip", productId: "../bad", quantity: 1 }],
    [
      { productType: "product", productId: "same", quantity: 1 },
      { productType: "product", productId: "same", quantity: 1 },
    ],
  ]) {
    assert.throws(
      () => validateCartRequest(lines),
      (e: any) => e instanceof CartQuoteError && e.name === "CartQuoteError",
    );
  }
});

test("bad cart quotes return HTTP 400 instead of masquerading as server outages", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/cart/quote`;
  try {
    for (const input of [{}, { lines: [] }, { lines: [{ productId: "p", productType: "product", quantity: -1 }] }]) {
      const response = await fetch(base, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      assert.equal(response.status, 400);
      assert.match(String((await response.json()).error), /Carrinho|Itens/);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
