// NetCraft Delivery SIM v0.2 — no external connections or reward mutations.
export class NetCraftDeliveryAdapter {
  constructor() { this.deliveries = new Map(); this.online = new Set(); }
  setPlayerOnline(name, connected) {
    const key=String(name).toLowerCase();
    if (connected) this.online.add(key); else this.online.delete(key);
  }
  accept(job) {
    if (!job || job.environment !== "test" || job.dispatchEnabled !== false ||
      !/^[a-f0-9]{64}-\d{1,3}$/.test(job.deliveryId ?? "") ||
      !/^[A-Za-z0-9_ ]{1,32}$/.test(job.gamertag ?? "") ||
      !["vip","kit"].includes(job.kind)) return {ok:false,reason:"invalid_fixture"};
    const previous=this.deliveries.get(job.deliveryId);
    if (previous) {
      if(previous.gamertag!==job.gamertag || previous.kind!==job.kind)
        return {ok:false,reason:"conflict"};
      return {ok:true,duplicate:true,state:previous.state};
    }
    const state=job.refunded === true ? "blocked":"waiting_for_player";
    this.deliveries.set(job.deliveryId,{id:job.deliveryId,gamertag:job.gamertag,kind:job.kind,state,attempts:0});
    return {ok:true,duplicate:false,state};
  }
  poll(gamertag) {
    return [...this.deliveries.values()]
      .filter(job => job.gamertag.toLowerCase()===String(gamertag).toLowerCase() && job.state==="waiting_for_player")
      .map(job=>({id:job.id,kind:job.kind,simulation:true}));
  }
  acknowledge(id) {
    const job=this.deliveries.get(id);
    if(!job) return {ok:false,reason:"unknown"};
    if(job.state==="blocked") return {ok:false,reason:"refunded"};
    if(job.state==="simulated_complete") return {ok:true,duplicate:true,state:job.state};
    if(!this.online.has(job.gamertag.toLowerCase())) return {ok:false,reason:"offline"};
    job.attempts++;job.state="simulated_complete";
    return {ok:true,duplicate:false,state:job.state,realDelivery:false};
  }
  retry(id) {
    const job=this.deliveries.get(id);
    if(!job || job.state!=="waiting_for_player")return false;
    job.attempts++;return true;
  }
  refund(id) {
    const job=this.deliveries.get(id);
    if(!job)return {ok:false,reason:"unknown"};
    job.state="blocked";return {ok:true,state:job.state,realRevocation:false};
  }
  snapshot(id) { const job=this.deliveries.get(id);return job?{...job}:null; }
}
