// Standalone HTTPS simulator for a local-only test machine.
// This is never registered in the website/Vercel API and never touches live Firebase.
import express from "express";
import https from "node:https";
import { readFileSync } from "node:fs";
import { createPixRouter } from "../server/routes/pix.ts"; // Type-check only; never mounted.
import { paymentDatabase } from "../server/payments/database.ts";
import { emulatorDeliveryStore } from "../server/delivery/emulatorStore.ts";
import { createDeliverySimulationRouter } from "../server/routes/deliverySimulation.ts";
void createPixRouter;
export function startLocalDeliveryHttpsDemo() {
  if (process.env.NODE_ENV !== "test" ||
      process.env.VERCEL_ENV ||
      process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8085" ||
      process.env.GCLOUD_PROJECT !== "demo-netcraft-admin-test")
    throw new Error("Local Firestore Emulator test only");
  const secret = process.env.NC_DELIVERY_SIM_HMAC_TEST_SECRET || "";
  const certPath = process.env.NC_DELIVERY_SIM_TLS_CERT_PATH;
  const keyPath = process.env.NC_DELIVERY_SIM_TLS_KEY_PATH;
  if (secret.length < 32 || !certPath || !keyPath)
    throw new Error("Missing external test-only HMAC secret or TLS files");
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2kb" }));
  app.use("/delivery", createDeliverySimulationRouter({
    secret, store: emulatorDeliveryStore(paymentDatabase()),
  }));
  return https.createServer({
    cert: readFileSync(certPath), key: readFileSync(keyPath),
  }, app).listen(0, "127.0.0.1");
}
// Deliberately no automatic invocation. Never expose this server to the Internet.
