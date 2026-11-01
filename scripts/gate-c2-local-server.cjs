"use strict";
// Gate C.2 localhost-only HTTPS server. Inert unless explicitly launched in lab mode.
// Serves synthetic challenge/poll only. No external fetch, payment, job, grant, or ACK.
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function createGateC2Server({ pfx, passphrase, cert, key, token }) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    throw new Error("Synthetic local token required");
  const issued = new Map();
  const used = new Set();
  const send = (res, code, payload) => {
    res.writeHead(code, {
      "content-type": "application/json", "cache-control": "no-store",
    });
    res.end(JSON.stringify(payload));
  };
  const transport = pfx ? { pfx, passphrase } : { cert, key };
  return https.createServer({ ...transport, minVersion: "TLSv1.2" }, async (req, res) => {
    try {
      if (req.socket.remoteAddress !== "127.0.0.1" &&
          req.socket.remoteAddress !== "::ffff:127.0.0.1") {
        send(res, 403, { error: "loopback_only" });
        return;
      }
      if (req.method === "GET" && req.url === "/health") {
        send(res, 200, { simulation: true, deliveriesEnabled: false, ackEnabled: false });
        return;
      }
      if (req.method !== "POST" || ![
        "/delivery/challenge", "/delivery/poll", "/delivery/ack",
      ].includes(req.url)) {
        send(res, 404, { error: "not_found" });
        return;
      }
      if (!String(req.headers["content-type"] || "").startsWith("application/json")) {
        send(res, 415, { error: "unsupported_media_type" });
        return;
      }
      const supplied = String(req.headers["x-nc-bds-token"] || "");
      const actual = Buffer.from(token);
      const submitted = Buffer.from(supplied);
      if (submitted.length !== actual.length ||
          !crypto.timingSafeEqual(actual, submitted)) {
        send(res, 401, { error: "unauthorized" });
        return;
      }
      let bytes = 0;
      const chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 1024) { send(res, 413, { error: "too_large" }); return; }
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { send(res, 400, { error: "invalid_json" }); return; }
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        send(res, 400, { error: "invalid_body" });
        return;
      }
      if (req.url === "/delivery/challenge") {
        const challenge = crypto.randomBytes(16).toString("hex");
        issued.set(challenge, Date.now());
        send(res, 200, { simulation: true, nonce: challenge });
        return;
      }
      const nonce = String(req.headers["x-nc-nonce"] || "");
      const stamp = String(req.headers["x-nc-timestamp"] || "");
      const now = Date.now();
      if (!/^[a-f0-9]{32}$/.test(nonce) || !/^\d{13}$/.test(stamp) ||
          Math.abs(now - Number(stamp)) > 60000) {
        send(res, 401, { error: "invalid_time_or_nonce" });
        return;
      }
      if (req.url === "/delivery/poll" && (
        body.gamertag !== "SyntheticLabOnly" ||
        Object.keys(body).length !== 1
      )) {
        send(res, 400, { error: "invalid_player" });
        return;
      }
      if (used.has(nonce)) { send(res, 401, { error: "replay" }); return; }
      const createdAt = issued.get(nonce);
      if (typeof createdAt !== "number" || now - createdAt > 60000 ||
          createdAt > now) {
        send(res, 401, { error: "challenge_expired_or_unknown" });
        return;
      }
      issued.delete(nonce);
      used.add(nonce);
      if (req.url === "/delivery/ack") {
        send(res, 409, { simulation: true, error: "ack_disabled" });
        return;
      }
      send(res, 200, { simulation: true, deliveries: [] });
    } catch {
      if (!res.headersSent) send(res, 500, { error: "internal_error" });
      else res.destroy();
    }
  });
}

if (require.main === module) {
  if (process.env.NC_GATE_C2_LOCAL !== "1" ||
      process.env.VERCEL_ENV || process.env.NC_SANDBOX_ENABLED === "true" ||
      process.env.NODE_ENV === "production") {
    throw new Error("Gate C.2 server may only start with explicit local lab flag");
  }
  const dir = __dirname;
  const token = JSON.parse(fs.readFileSync(path.join(dir, "synthetic.json"), "utf8"))
    .nc_gate_c_synthetic;
  const server = createGateC2Server({
    pfx: fs.readFileSync(path.join(dir, "gate-c2-cert.pfx")),
    passphrase: process.env.NC_GATE_C_PFX_PASSWORD,
    token,
  });
  server.listen(18443, "127.0.0.1", () => {
    console.log("GATE_C2_HTTPS_LOCAL_READY");
  });
}
module.exports = { createGateC2Server };
