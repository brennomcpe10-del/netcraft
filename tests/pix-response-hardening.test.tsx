import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import express from "express";
import { once } from "node:events";
import { createPixRouter } from "../server/routes/pix.ts";

test("Pix responses are never cached, even when configuration fails", async () => {
  const app = express();
  app.use(createPixRouter({
    database: () => { throw new Error("Database unavailable"); },
    gateway: () => { throw new Error("Gateway unavailable"); },
    assertEnvironment: () => { throw new Error("Sandbox unavailable"); },
    webhookSecret: () => "",
  } as any));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const port = (server.address() as any).port;
    for (const [method, route] of [
      ["GET", "/pix/config"],
      ["GET", "/pix/orders/invalid"],
      ["POST", "/pix/orders"],
      ["POST", "/pix/webhook"],
    ]) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method === "POST" ? { body: "{}" } : {}),
      });
      assert.equal(response.headers.get("cache-control"), "no-store", route);
      assert.ok(response.status >= 400, route);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("Webhook diagnostic identifies numeric IDs without changing signature validation", () => {
  const source = readFileSync(new URL("../server/routes/pix.ts", import.meta.url), "utf8");
  assert.ok(source.includes(String.raw`: /^\d+$/.test(id)`));
  assert.ok(!source.includes(String.raw`: /^\\d+$/.test(id)`));
  assert.match(source, /if \(!documentedSignatureValid && !previewOriginalCaseSignatureValid\)/);
});
