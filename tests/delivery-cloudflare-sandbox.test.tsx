import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- standalone Worker is deliberately framework-independent
import sandbox from "../sandbox/cloudflare/worker.mjs";
const token = "dedicated-test-token-not-a-production-secret-12345";
const nonce = "f".repeat(32);
const env = () => {
  const seen = new Set<string>();
  return { NC_SANDBOX_ENABLED: "true", NC_BDS_TEST_TOKEN: token,
    NONCE_GATE: { idFromName: (name: string) => name, get: () => ({
      fetch: async (_url: string, init: { body: string }) => {
        const key = JSON.parse(init.body).nonce;
        if (seen.has(key)) return new Response("duplicate", { status: 409 });
        seen.add(key); return new Response("accepted");
      },
    }) },
  };
};
const request = (path: string, secret: string, id: string, body: object, time=Date.now()) =>
  new Request("https://sandbox.example" + path, {method:"POST",
    headers:{"content-type":"application/json","x-nc-bds-token":secret,
      "x-nc-nonce":id,"x-nc-timestamp":String(time)},body:JSON.stringify(body)});
test("separate HTTPS sandbox disabled by default and never returns rewards",async()=>{
  const e = env();
  assert.equal((await sandbox.fetch(request("/delivery/poll",token,nonce,{gamertag:"OfflinePlayer"}),{...e,NC_SANDBOX_ENABLED:"false"})).status,503);
  const ping = await sandbox.fetch(new Request("https://sandbox.example/health"),e);
  assert.deepEqual((await ping.json()).deliveryEnabled,false);
  const first = await sandbox.fetch(request("/delivery/poll",token,nonce,{gamertag:"OfflinePlayer"}),e);
  assert.deepEqual((await first.json()).deliveries,[]);
  assert.equal((await sandbox.fetch(request("/delivery/poll",token,nonce,{gamertag:"OfflinePlayer"}),e)).status,401);
  assert.equal((await sandbox.fetch(request("/delivery/poll","bad","1".repeat(32),{gamertag:"OfflinePlayer"}),e)).status,401);
  assert.equal((await sandbox.fetch(request("/delivery/poll",token,"2".repeat(32),{gamertag:"OfflinePlayer"},Date.now()-300000),e)).status,401);
  const ack = await sandbox.fetch(request("/delivery/ack",token,"3".repeat(32),{deliveryId:"a".repeat(64)+"-1"}),e);
  assert.equal(ack.status,409);
  assert.deepEqual((await ack.json()).error,"ack_disabled");
  assert.equal((await sandbox.fetch(request("/delivery/refund",token,"4".repeat(32),{}),e)).status,404);
});
