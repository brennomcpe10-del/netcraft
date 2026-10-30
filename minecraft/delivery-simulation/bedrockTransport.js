// Dependency-injected Bedrock transport boundary. No @minecraft/server-net import,
// no URL, no credentials, no reward commands. Requires an explicit test transport.
export function createBedrockDeliveryTransport(options) {
  if (!options || options.simulation !== true ||
      typeof options.post !== "function" ||
      typeof options.verify !== "function")
    throw new Error("Simulation transport required");
  let pending = false;
  return {
    async poll(gamertag) {
      if (pending) return { ok: false, reason: "busy" };
      if (typeof gamertag !== "string" || !/^[A-Za-z0-9_ ]{1,32}$/.test(gamertag))
        return { ok: false, reason: "invalid_player" };
      pending = true;
      try {
        const result = await options.post("/poll", { gamertag });
        if (!options.verify(result) || result.status !== 200 ||
            !Array.isArray(result.data?.deliveries))
          return { ok: false, reason: "unauthenticated_response" };
        const deliveries = [];
        for (const row of result.data.deliveries) {
          if (!row || !/^[a-f0-9]{64}-\d{1,3}$/.test(row.id || "") ||
              !["vip", "kit"].includes(row.kind) || row.simulation !== true)
            return { ok: false, reason: "invalid_response" };
          deliveries.push({ id: row.id, kind: row.kind, simulation: true });
        }
        return { ok: true, deliveries };
      } catch {
        return { ok: false, reason: "network_failure" };
      } finally {
        pending = false;
      }
    },
    async simulateAck(deliveryId) {
      if (!/^[a-f0-9]{64}-\d{1,3}$/.test(deliveryId || ""))
        return { ok: false, reason: "invalid_id" };
      try {
        const response = await options.post("/ack", { deliveryId });
        if (!options.verify(response) || response.status !== 200 ||
            response.data?.simulation !== true ||
            response.data?.state !== "simulated_complete")
          return { ok: false, reason: "not_confirmed" };
        return { ok: true, simulation: true };
      } catch {
        return { ok: false, reason: "network_failure" };
      }
    }
  };
}
