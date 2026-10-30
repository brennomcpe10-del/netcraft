// PREVIEW-ONLY Cloudflare Worker; deliberately NO payment, reward or actual ACK.
// DO binding persists nonce claims atomically across instances and restarts.
export class NonceGate {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    const data = await request.json();
    const nonce = data.nonce;
    if (!/^[a-f0-9]{32}$/.test(nonce)) return new Response("invalid", { status: 400 });
    const key = "nonce:" + nonce;
    if (this.ctx.storage.kv.get(key) !== undefined)
      return new Response("duplicate", { status: 409 });
    this.ctx.storage.kv.put(key, Date.now());
    return new Response("accepted");
  }
}
function equalsFixed(a,b) {
  if (typeof a !== "string" || typeof b !== "string" ||
      a.length < 32 || a.length > 256 || a.length !== b.length) return false;
  let diff = 0;
  for (let i=0;i<a.length;i++) diff |= a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
function json(data,status=200) {
  return new Response(JSON.stringify(data), {status,headers:{"content-type":"application/json","cache-control":"no-store"}});
}
export default {
  async fetch(request, env) {
    if (env.NC_SANDBOX_ENABLED !== "true" || !env.NC_BDS_TEST_TOKEN ||
        !env.NONCE_GATE) return json({error:"disabled"},503);
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET")
      return json({environment:"isolated_test",simulation:true,deliveryEnabled:false});
    if (request.method !== "POST" ||
        !["/delivery/poll","/delivery/ack"].includes(url.pathname))
      return json({error:"not_found"},404);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return json({error:"unsupported_media_type"},415);
    if (!equalsFixed(request.headers.get("x-nc-bds-token"),env.NC_BDS_TEST_TOKEN))
      return json({error:"unauthorized"},401);
    const stamp = request.headers.get("x-nc-timestamp") || "";
    const nonce = request.headers.get("x-nc-nonce") || "";
    if (!/^\d{13}$/.test(stamp) || Math.abs(Date.now()-Number(stamp))>60000 ||
        !/^[a-f0-9]{32}$/.test(nonce)) return json({error:"unauthorized"},401);
    const size = request.headers.get("content-length");
    if (size && (+size>2048 || !Number.isFinite(+size))) return json({error:"too_large"},413);
    let body;
    try {
      const raw = await request.text();
      if (raw.length > 2048) return json({error:"too_large"},413);
      body=JSON.parse(raw);
    } catch { return json({error:"invalid_json"},400); }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return json({error:"invalid_body"},400);
    if (url.pathname === "/delivery/poll" &&
        (typeof body.gamertag !== "string" || !/^[A-Za-z0-9_ ]{1,32}$/.test(body.gamertag)))
      return json({error:"invalid_player"},400);
    if (url.pathname === "/delivery/ack" &&
        (typeof body.deliveryId !== "string" || !/^[a-f0-9]{64}-\d{1,3}$/.test(body.deliveryId)))
      return json({error:"invalid_delivery"},400);
    const stub = env.NONCE_GATE.get(env.NONCE_GATE.idFromName("netcraft-delivery-sandbox-v1"));
    const result = await stub.fetch("https://internal/claim",{
      method:"POST",body:JSON.stringify({nonce})
    });
    if (!result.ok) return json({error:result.status===409?"replay":"nonce_error"},result.status===409?401:503);
    // Never return a job until sandbox store and offline/ACK semantics are reviewed.
    if (url.pathname === "/delivery/poll") return json({deliveries:[],simulation:true});
    return json({error:"ack_disabled",simulation:true},409);
  }
};
