# NetCraft Delivery — HTTPS connectivity diagnostic (simulation only)

No real checkout, Pix, player inventories, VIP grant, or Minecraft delivery may be enabled by this document.

## Current state
- `minecraft/delivery-simulation/bedrockNetworkDiagnostic.js` is **not imported, not packaged, and hard-disabled** (`DISABLED = true`). It cannot initiate a network request during normal server operation.
- The optional `@minecraft/server-net` import is only for a future **separate test build**; do not enable it in the production NetCraftCore.
- The local simulation HMAC protocol remains in `server/routes/deliverySimulation.ts`. Its current replay nonce set is memory-only and is not sufficient for distributed production authentication.

## MagnoHost preflight (do not change production settings yet)
1. Confirm in panel/support whether the plan is a true **Bedrock Dedicated Server (BDS)** rather than a proxy or non-BDS engine.
2. Confirm exact Minecraft Bedrock Dedicated Server version and whether experimental `@minecraft/server-net` is supported on it.
3. Confirm whether a **test instance**, `behavior_packs`, and per-pack `config/<pack-uuid>/permissions.json` can be configured. Do not grant network access to every addon by editing `config/default/permissions.json` unless necessary and reviewed.
4. Ask whether outbound HTTPS (TCP 443) to a fixed test domain is permitted. Do not share credentials or account details.
5. Keep `force_https: true`, use an explicit `allowed_uris` list and restrict concurrency/body sizes when support is confirmed. Never authorize production store URLs for this diagnostic.

Microsoft documentation: https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.10
and https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-net/minecraft-server-net .

## Future test acceptance criteria
- On a backup/test BDS only, explicitly enable a fixed no-sensitive-data HTTPS health endpoint.
- Confirm response code, allowlist rejection, timeout behavior and disabled-by-default behavior.
- No payment data, no keys in pack files, no live delivery, no production Firebase.
- Implement backend-mediated scope-limited service authentication and durable nonce/idempotency handling before any live protocol.
