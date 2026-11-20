// NetCraft Delivery SIM client for Node-based integration tests only.
// This is NOT a Minecraft Script API HTTP client and never grants rewards.
import crypto from "node:crypto";
import { NetCraftDeliveryAdapter } from "./adapter.js";

export class NetCraftDeliverySimulationClient {
  constructor({ origin, secret, adapter = new NetCraftDeliveryAdapter(), transport = fetch }) {
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) || typeof secret !== "string" || secret.length < 32)
      throw new Error("Local simulation only");
    this.origin = origin;
    this.secret = secret;
    this.adapter = adapter;
    this.transport = transport;
  }
  async request(path, body, { nonce = crypto.randomBytes(16).toString("hex"), timestamp = String(Date.now()) } = {}) {
    if (!["/seed", "/poll", "/ack", "/retry", "/refund"].includes(path)) throw new Error("Unsupported simulation route");
    const payload = JSON.stringify(body);
    const manifest = ["POST", path, timestamp, nonce, payload].join("\n");
    const signature = crypto.createHmac("sha256", this.secret).update(manifest).digest("hex");
    const response = await this.transport(this.origin + "/delivery" + path, {
      method: "POST", headers: {
        "content-type": "application/json",
        "x-nc-timestamp": timestamp, "x-nc-nonce": nonce, "x-nc-signature": signature,
      }, body: payload,
    });
    const data = await response.json();
    return { status: response.status, data };
  }
  async seed(fixture) { return this.request("/seed", fixture); }
  async syncPlayer(gamertag, online) {
    this.adapter.setPlayerOnline(gamertag, online);
    if (!online) return { received: 0, simulated: 0 };
    const result = await this.request("/poll", { gamertag });
    if (result.status !== 200) throw new Error("Simulation poll denied");
    let simulated = 0;
    for (const row of result.data.deliveries) {
      const fixture = {
        deliveryId: row.id, gamertag, kind: row.kind,
        environment: "test", dispatchEnabled: false,
      };
      const accepted = this.adapter.accept(fixture);
      if (!accepted.ok) throw new Error("Simulation fixture rejected");
      const local = this.adapter.acknowledge(row.id);
      if (!local.ok) throw new Error("Offline or blocked");
      const ack = await this.request("/ack", { deliveryId: row.id });
      if (ack.status !== 200 || ack.data.state !== "simulated_complete")
        throw new Error("Simulation ACK refused");
      if (!ack.data.duplicate) simulated++;
    }
    return { received: result.data.deliveries.length, simulated };
  }
  async refund(deliveryId) {
    const response = await this.request("/refund", { deliveryId });
    if (response.status === 200) this.adapter.refund(deliveryId);
    return response;
  }
}
