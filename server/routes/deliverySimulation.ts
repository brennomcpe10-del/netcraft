import crypto from "node:crypto";
import express from "express";
import type { emulatorDeliveryStore } from "../delivery/emulatorStore.ts";

// Test-only in-memory API. Never reads Pix orders or changes Minecraft/Firestore.
export type DeliverySimulation = {
  deliveryId: string; gamertag: string; kind: "vip" | "kit";
  environment: "test"; dispatchEnabled: false;
  refunded?: boolean;
};
type RecordState = DeliverySimulation & { state: "waiting_for_player" | "simulated_complete" | "blocked"; acknowledged: boolean };
export function createDeliverySimulationRouter(options: {
  secret: string; now?: () => number; production?: boolean; bdsToken?: string;
  store?: ReturnType<typeof emulatorDeliveryStore>;
}) {
  const router = express.Router();
  const jobs = new Map<string, RecordState>();
  const nonces = new Set<string>();
  const now = options.now || Date.now;
  router.use(async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (options.production || process.env.VERCEL_ENV === "production" ||
      process.env.NODE_ENV !== "test" || options.secret.length < 32)
      return res.status(503).json({ error: "Simulation unavailable" });
    const timestamp = String(req.header("x-nc-timestamp") || "");
    const nonce = String(req.header("x-nc-nonce") || "");
    const signature = String(req.header("x-nc-signature") || "");
    const bearer = String(req.header("x-nc-bds-token") || "");
    const usesToken = bearer.length > 0;
    const token = options.bdsToken || "";
    const allowedBdsRoute = req.path === "/poll" || req.path === "/ack";
    const tokenAuthorized = usesToken && allowedBdsRoute && req.method === "POST" && token.length >= 32 &&
      bearer.length === token.length &&
      crypto.timingSafeEqual(Buffer.from(bearer), Buffer.from(token));
    if (!/^\d{13}$/.test(timestamp) || Math.abs(now() - Number(timestamp)) > 60000 ||
      !/^[a-f0-9]{32}$/.test(nonce) || (usesToken ? !tokenAuthorized : !/^[a-f0-9]{64}$/.test(signature)) || nonces.has(nonce))
      return res.status(401).json({ error: "Unauthorized" });
    const body = JSON.stringify(req.body ?? {});
    const message = [req.method, req.path, timestamp, nonce, body].join("\n");
    if (!usesToken) {
      const expected = crypto.createHmac("sha256", options.secret).update(message).digest("hex");
      if (!crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex")))
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (options.store) {
      try {
        const claimed = await options.store.claimNonce(nonce, Number(timestamp));
        if (!claimed) return res.status(401).json({ error: "Unauthorized" });
      } catch {
        return res.status(503).json({ error: "Simulation unavailable" });
      }
    } else {
      nonces.add(nonce);
    }
    next();
  });
  router.post("/seed", async (req, res) => {
    const d: DeliverySimulation = req.body;
    if (!d || d.environment !== "test" || d.dispatchEnabled !== false ||
      !/^[a-f0-9]{64}-\d{1,3}$/.test(d.deliveryId || "") ||
      !/^[A-Za-z0-9_ ]{1,32}$/.test(d.gamertag || "") ||
      !["vip", "kit"].includes(d.kind) || typeof d.refunded !== "boolean" && d.refunded !== undefined)
      return res.status(400).json({ error: "Invalid test delivery" });
    if (options.store) {
      try {
        const result = await options.store.seed({ id: d.deliveryId, gamertag: d.gamertag, kind: d.kind, dispatchEnabled: false, ...(d.refunded !== undefined ? { refunded: d.refunded } : {}) });
        return res.status(result.duplicate ? 200 : 201).json({ id: d.deliveryId, ...result });
      } catch { return res.status(409).json({ error: "Simulation rejected" }); }
    }
    const previous = jobs.get(d.deliveryId);
    if (previous) {
      if (previous.gamertag !== d.gamertag || previous.kind !== d.kind ||
        (d.refunded === false && previous.state === "blocked"))
        return res.status(409).json({ error: "Conflicting delivery" });
      return res.json({ id: d.deliveryId, state: previous.state, duplicate: true });
    }
    const state = d.refunded ? "blocked" : "waiting_for_player";
    jobs.set(d.deliveryId, { ...d, state, acknowledged: false });
    return res.status(201).json({ id: d.deliveryId, state, duplicate: false });
  });
  router.post("/poll", async (req, res) => {
    const gamertag = req.body?.gamertag;
    if (typeof gamertag !== "string" || !/^[A-Za-z0-9_ ]{1,32}$/.test(gamertag))
      return res.status(400).json({ error: "Invalid player" });
    if (options.store) {
      try { return res.json({ deliveries: await options.store.poll(gamertag) }); }
      catch { return res.status(503).json({ error: "Simulation unavailable" }); }
    }
    return res.json({ deliveries: [...jobs.values()]
      .filter(j => j.gamertag === gamertag && j.state === "waiting_for_player")
      .map(j => ({ id: j.deliveryId, kind: j.kind, simulation: true })) });
  });
  router.post("/ack", async (req, res) => {
    const id = req.body?.deliveryId;
    if (options.store) {
      try { const result = await options.store.acknowledge(id); return res.json({ id, ...result, simulation: true }); }
      catch { return res.status(409).json({ error: "Simulation rejected" }); }
    }
    const job = typeof id === "string" ? jobs.get(id) : undefined;
    if (!job) return res.status(404).json({ error: "Not found" });
    if (job.state === "blocked") return res.status(409).json({ error: "Refund blocked" });
    const duplicate = job.state === "simulated_complete";
    job.acknowledged = true;
    job.state = "simulated_complete";
    return res.json({ id, state: job.state, duplicate, simulation: true });
  });
  router.post("/refund", async (req, res) => {
    const id = req.body?.deliveryId;
    if (options.store) {
      try { return res.json({ id, ...await options.store.refund(id), simulation: true }); }
      catch { return res.status(409).json({ error: "Simulation rejected" }); }
    }
    const job = typeof id === "string" ? jobs.get(id) : undefined;
    if (!job) return res.status(404).json({ error: "Not found" });
    job.state = "blocked";
    return res.json({ id, state: "blocked", simulation: true });
  });
  router.post("/retry", async (req, res) => {
    if (!options.store) return res.status(503).json({ error: "Persistent emulator required" });
    try { return res.json({ retried: await options.store.retry(req.body?.deliveryId), simulation: true }); }
    catch { return res.status(409).json({ error: "Simulation rejected" }); }
  });
  return router;
}
