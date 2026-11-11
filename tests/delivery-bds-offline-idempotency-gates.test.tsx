import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- intentionally framework-independent, inactive simulation adapter
import { NetCraftDeliveryAdapter } from "../minecraft/delivery-simulation/adapter.js";

const id = "b".repeat(64) + "-1";
const job = { deliveryId: id, gamertag: "OfflinePlayer", kind: "vip", environment: "test", dispatchEnabled: false };

test("offline player remains waiting; duplicate fixture is idempotent", () => {
  const adapter = new NetCraftDeliveryAdapter();
  assert.equal(adapter.accept(job).state, "waiting_for_player");
  assert.equal(adapter.accept(job).duplicate, true);
  assert.equal(adapter.poll("OfflinePlayer").length, 1);
  assert.deepEqual(adapter.acknowledge(id), { ok: false, reason: "offline" });
  assert.equal(adapter.snapshot(id).attempts, 0);
  assert.equal(adapter.snapshot(id).state, "waiting_for_player");
  assert.equal(adapter.accept({ ...job, kind: "kit" }).reason, "conflict");
});

test("test-only ACK is idempotent once player is online, without real grants", () => {
  const adapter = new NetCraftDeliveryAdapter();
  adapter.accept(job);
  adapter.setPlayerOnline("offlineplayer", true);
  const first = adapter.acknowledge(id);
  assert.equal(first.ok, true);
  assert.equal(first.realDelivery, false);
  assert.equal(first.duplicate, false);
  assert.equal(adapter.snapshot(id).attempts, 1);
  assert.equal(adapter.poll("OfflinePlayer").length, 0);
  const repeated = adapter.acknowledge(id);
  assert.equal(repeated.duplicate, true);
  assert.equal(adapter.snapshot(id).attempts, 1);
});

test("refund blocks pending simulated ACK even if player subsequently joins", () => {
  const adapter = new NetCraftDeliveryAdapter();
  adapter.accept(job);
  assert.equal(adapter.refund(id).state, "blocked");
  adapter.setPlayerOnline("OfflinePlayer", true);
  assert.deepEqual(adapter.acknowledge(id), { ok: false, reason: "refunded" });
  assert.equal(adapter.poll("OfflinePlayer").length, 0);
  assert.equal(adapter.retry(id), false);
});

test("simulation rejects fixtures that could enable dispatch", () => {
  const adapter = new NetCraftDeliveryAdapter();
  assert.equal(adapter.accept({ ...job, dispatchEnabled: true }).ok, false);
  assert.equal(adapter.accept({ ...job, environment: "production" }).ok, false);
  assert.equal(adapter.accept({ ...job, deliveryId: "bad" }).ok, false);
  assert.equal(adapter.snapshot(id), null);
});
