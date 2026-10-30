import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import { once } from "node:events";
import { createDeliverySimulationRouter } from "../server/routes/deliverySimulation.ts";

const secret = "simulation-only-secret-should-never-be-used-live";
const id = "a".repeat(64) + "-0";
const base = { deliveryId: id, gamertag: "OfflinePlayer", kind: "vip",
  environment: "test", dispatchEnabled: false };
test("authenticated test-only bridge: offline, retry, ACK, refund and disabled real delivery", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  const app = express();
  app.use(express.json());
  app.use("/delivery", createDeliverySimulationRouter({ secret }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = "http://127.0.0.1:" + (server.address() as any).port;
  const request = async (path: string, body: any, opts: { bad?: boolean; stale?: boolean; nonce?: string } = {}) => {
    const timestamp = String(Date.now() - (opts.stale ? 300000 : 0));
    const nonce = opts.nonce ?? crypto.randomBytes(16).toString("hex");
    const payload = JSON.stringify(body);
    const message = ["POST", path, timestamp, nonce, payload].join("\n");
    const signature = crypto.createHmac("sha256", opts.bad ? "wrong" : secret).update(message).digest("hex");
    const response = await fetch(url + "/delivery" + path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-nc-timestamp": timestamp,
        "x-nc-nonce": nonce, "x-nc-signature": signature },
      body: payload,
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    assert.equal((await request("/seed", base, { bad: true })).status, 401);
    assert.equal((await request("/seed", base, { stale: true })).status, 401);
    assert.equal((await request("/seed", { ...base, dispatchEnabled: true })).status, 400);
    assert.equal((await request("/seed", base)).status, 201);
    const duplicate = await request("/seed", base);
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.data.duplicate, true);
    assert.equal((await request("/poll", { gamertag: "SomeoneElse" })).data.deliveries.length, 0);
    assert.equal((await request("/poll", { gamertag: "OfflinePlayer" })).data.deliveries.length, 1);
    assert.equal((await request("/ack", { deliveryId: id })).data.state, "simulated_complete");
    assert.equal((await request("/poll", { gamertag: "OfflinePlayer" })).data.deliveries.length, 0);
    assert.equal((await request("/refund", { deliveryId: id })).data.state, "blocked");
    assert.equal((await request("/ack", { deliveryId: id })).status, 409);
    assert.equal((await request("/seed", base)).data.state, "blocked");
    assert.equal((await request("/seed", { ...base, refunded: false })).status, 409);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
test("production gate refuses simulation even with correctly signed messages", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const app = express();
  app.use(express.json());
  app.use("/delivery", createDeliverySimulationRouter({ secret }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const response = await fetch("http://127.0.0.1:" + (server.address() as any).port + "/delivery/poll", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ gamertag: "OfflinePlayer" }),
    });
    assert.equal(response.status, 503);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
