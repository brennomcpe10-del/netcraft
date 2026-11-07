// NetCraft Delivery HTTPS BDS adapter - simulation only.
// NOT imported by active Minecraft packs. No Pix, grants, VIP or item handling.
// Dependencies (http, HttpRequest, HttpRequestMethod, signing, secrets) MUST be
// injected by a separately reviewed test-only bootstrap.
const allowed = new Set(["/poll", "/ack"]);
export function createSignedBedrockHttpsBridge(options) {
  if (!options || options.enabled !== true || options.simulation !== true ||
      typeof options.origin !== "string" ||
      !/^https:\/\/[a-z0-9.-]+(?::443)?$/i.test(options.origin) ||
      typeof options.sign !== "function" ||
      typeof options.nonce !== "function" ||
      typeof options.now !== "function" ||
      !options.http || typeof options.http.request !== "function" ||
      typeof options.HttpRequest !== "function" || !options.methods?.Post)
    throw new Error("Signed test-only bridge not configured");
  if (options.origin.includes("example.com") || options.origin.includes("localhost"))
    throw new Error("Dedicated HTTPS test endpoint required");
  let busy = false;
  async function post(path, data) {
    if (!allowed.has(path)) throw new Error("Operation not allowed");
    if (busy) return { ok: false, reason: "busy" };
    busy = true;
    try {
      const body = JSON.stringify(data);
      if (body.length > 1024) return { ok: false, reason: "request_too_large" };
      const timestamp = String(options.now());
      const nonce = options.nonce();
      if (!/^\d{13}$/.test(timestamp) || !/^[a-f0-9]{32}$/.test(nonce))
        return { ok: false, reason: "invalid_identity" };
      const manifest = ["POST", path, timestamp, nonce, body].join("\n");
      const signature = await options.sign(manifest);
      if (!/^[a-f0-9]{64}$/.test(signature)) return { ok: false, reason: "signature_unavailable" };
      const req = new options.HttpRequest(options.origin + "/delivery" + path);
      req.method = options.methods.Post;
      req.timeout = 5;
      req.body = body;
      req.headers = [
        { key: "Content-Type", value: "application/json" },
        { key: "x-nc-timestamp", value: timestamp },
        { key: "x-nc-nonce", value: nonce },
        { key: "x-nc-signature", value: signature },
      ];
      const response = await options.http.request(req);
      if (response.status !== 200 || typeof response.body !== "string" || response.body.length > 8192)
        return { ok: false, reason: "http_rejected", status: response.status };
      const parsed = JSON.parse(response.body);
      return { ok: true, data: parsed };
    } catch {
      return { ok: false, reason: "network_or_response_error" };
    } finally {
      busy = false;
    }
  }
  return {
    async poll(gamertag) {
      if (typeof gamertag !== "string" || !/^[A-Za-z0-9_ ]{1,32}$/.test(gamertag))
        return { ok: false, reason: "invalid_player" };
      const result = await post("/poll", { gamertag });
      if (!result.ok) return result;
      const jobs = result.data?.deliveries;
      if (!Array.isArray(jobs) || jobs.length > 30 ||
          jobs.some(job => !job || !/^[a-f0-9]{64}-\d{1,3}$/.test(job.id) ||
            !["vip", "kit"].includes(job.kind) || job.simulation !== true))
        return { ok: false, reason: "invalid_jobs" };
      return { ok: true, jobs };
    },
    async simulatedAck(deliveryId) {
      if (!/^[a-f0-9]{64}-\d{1,3}$/.test(deliveryId || ""))
        return { ok: false, reason: "invalid_id" };
      const result = await post("/ack", { deliveryId });
      return result.ok && result.data?.simulation === true &&
        result.data?.state === "simulated_complete"
        ? { ok: true, simulation: true, duplicate: result.data.duplicate === true }
        : { ok: false, reason: "ack_rejected" };
    },
  };
}
