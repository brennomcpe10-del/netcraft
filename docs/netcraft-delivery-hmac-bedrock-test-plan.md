# NetCraft Delivery: HMAC Bedrock and isolated backend preflight

Status: SIMULATION ONLY. Do not install as an active addon, enable paid orders, or deliver items.

## Implemented
- `minecraft/delivery-simulation/hmacSha256.js`: dependency-free UTF-8 SHA256/HMAC-SHA256. Secret passed through `createBedrockTestSigner(readSecret)`; **not embedded in pack**.
- `minecraft/delivery-simulation/signedHttpsBridge.js`: allows only simulated `/poll` and `/ack`; no VIP/item actions, no automatic entrypoint, no live endpoint.
- `server/routes/deliverySimulation.ts`: test-only HMAC verification with timestamp and nonce; production disabled. `server/delivery/emulatorStore.ts` stores demo jobs transactionally in `demo-netcraft-admin-test`.

## Gaps before MagnoHost installation
- No real Bedrock script bootstrap reads server-only secrets from `@minecraft/server-admin`; this MUST be tested/verified for BDS 1.26.60.6.
- The simulation Express router is not mounted on the public API; no dedicated HTTPS sandbox deployment or URL is provisioned. `demo.invalid` is an intentionally non-routable placeholder.
- HMAC nonce replay tracking is only in-memory. For multiple backend instances, use durable atomic nonce storage and expiry. HMAC requests must also enforce authorization scopes and avoid giving seed/refund permission to the game client.
- Refund blocking currently prevents later simulated ACK, but never reverses granted VIPs or items (none are granted).
- Server-side `@minecraft/server-net` requires scoped UUID permissions and a specific allowlisted HTTPS URI. The prior GET to example.com confirms outbound HTTPS **to that host only**.

## Security boundary
Never put secret values in scripts, manifests, GitHub, browser code, screenshots or console output. Create a dedicated test-only secret separately for the BDS test bootstrap and sandbox backend. Do not reuse payment credentials.
Do not attempt MagnoHost testing until a private sandbox API, constrained server-admin secret injection and safe script bootstrap have been created and reviewed.
