import { test } from "node:test";
import assert from "node:assert/strict";
import { startLocalDeliveryHttpsDemo } from "../scripts/delivery-local-https-demo.ts";

test("isolated HTTPS demo refuses missing BDS SecretString counterpart", () => {
  const names = ["NODE_ENV","VERCEL_ENV","FIRESTORE_EMULATOR_HOST","GCLOUD_PROJECT",
    "NC_DELIVERY_SIM_HMAC_TEST_SECRET","NC_DELIVERY_SIM_BDS_TOKEN",
    "NC_DELIVERY_SIM_TLS_CERT_PATH","NC_DELIVERY_SIM_TLS_KEY_PATH"] as const;
  const original = names.map(name => [name, process.env[name]] as const);
  try {
    process.env.NODE_ENV = "test";
    delete process.env.VERCEL_ENV;
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8085";
    process.env.GCLOUD_PROJECT = "demo-netcraft-admin-test";
    process.env.NC_DELIVERY_SIM_HMAC_TEST_SECRET = "a".repeat(40);
    delete process.env.NC_DELIVERY_SIM_BDS_TOKEN;
    process.env.NC_DELIVERY_SIM_TLS_CERT_PATH = "/this/path/must/not/exist";
    process.env.NC_DELIVERY_SIM_TLS_KEY_PATH = "/this/path/must/not/exist";
    assert.throws(() => startLocalDeliveryHttpsDemo(), /Missing isolated test credentials/);
    process.env.NC_DELIVERY_SIM_BDS_TOKEN = "b".repeat(40);
    assert.throws(() => startLocalDeliveryHttpsDemo(), /ENOENT/);
    process.env.VERCEL_ENV = "preview";
    assert.throws(() => startLocalDeliveryHttpsDemo(), /Local Firestore Emulator test only/);
  } finally {
    for (const [name, value] of original) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
