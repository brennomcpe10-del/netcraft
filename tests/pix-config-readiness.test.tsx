import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { createPixRouter } from "../server/routes/pix.ts";

test("checkout health checks both test receiver and Firestore with read only", async () => {
  let reads = 0, writes = 0;
  let receiverIsTestAccount = true;
  let databaseFails = false;
  const app = express();
  app.use(createPixRouter({
    assertEnvironment: () => {},
    gateway: () => ({ me: async () => ({
      id: 42, netcraftTestAccount: receiverIsTestAccount,
    }) }) as any,
    database: () => ({
      collection: (collection: string) => {
        assert.equal(collection, "pixTestOrders");
        return {
          doc: (id: string) => {
            assert.equal(id, "__netcraft_preview_readiness__");
            return {
              get: async () => {
                reads++;
                if (databaseFails) throw Error("private persistence outage");
                return { exists: false };
              },
              set: () => { writes++; throw Error("unexpected write"); },
            };
          },
        };
      },
    }) as any,
    webhookSecret: () => "",
  }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as any).port}/pix/config`;
  try {
    let response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).available, true);
    assert.equal(reads, 1);
    assert.equal(writes, 0);

    databaseFails = true;
    response = await fetch(url);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.available, false);
    assert.equal(body.stage, "persistence");
    assert.ok(!JSON.stringify(body).includes("private persistence outage"));

    receiverIsTestAccount = false;
    response = await fetch(url);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).available, false);
    assert.equal(reads, 2, "real receiver must fail before opening Firestore");
    assert.equal(writes, 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
