# NetCraft Delivery: BDS 1.26.61.1 HTTPS preflight — verified evidence and next safety gate

## Observed independently on MagnoHost (2026-10-30)

The administrator-provided BDS console showed:
- Official Bedrock Dedicated Server **1.26.61.1**, NetCraft HTTPS Diagnostico (OFF) pack v0.1.0 loaded.
- `[NetCraft HTTPS DIAG] HTTP status=200; reachable=true.` for a one-off GET to `https://example.com/`.
- This confirms **that one allowlisted outbound HTTPS GET succeeded** with `@minecraft/server-net`, not that the Cloudflare Worker was contacted or that the production delivery protocol is ready.
- The diagnostic's `nc_https_probe_enabled` was temporarily enabled for that test. It must be restored to **false**, saved, and the BDS restarted for the disabled setting to take effect. The repo cannot verify the live variable after the test.

## Isolation and compatibility

- The installed diagnostic module UUID is `60c499db-2ac2-4b7e-8e68-8132f9b14a88`; do not reuse its settings for delivery.
- The diagnostic manifest declares `@minecraft/server` 1.17.0, `@minecraft/server-admin` 1.0.0-beta, and `@minecraft/server-net` 1.0.0-beta. The successful GET verifies a usable subset of HTTP APIs, **not** `HttpHeader(SecretString)` behavior for an authenticated POST.
- The uninstalled `minecraft/delivery-simulation/bedrockSecretHeaderTransport.js` is a possible prototype matching the Cloudflare header-token protocol. Its flag is test-only; no behavior pack imports it. Do not place an actual token in world data, variables.json, source, or logs.
- `sandbox/cloudflare/worker.mjs` currently expects a bearer token and nonce/timestamp. The separately simulated `signedHttpsBridge.js` uses HMAC; these are **not interchangeable**. Choose and review a single protocol before any actual link.
- The public Worker remains disabled by `NC_SANDBOX_ENABLED=false`. Its durable nonce SQLite protection passed a real local workerd restart and 24 concurrent calls. There is still no published end-to-end BDS → Cloudflare authentication test.
- The BDS startup log also showed missing server-net permissions for other addons (TikTok, VCMC and Discord). These are distinct issues. Do not loosen `config/default/permissions.json` globally to address them.

## Before the first authenticated HTTPS test

1. Confirm that the old diagnostic variable has been restored to `false` and the server restarted; its check must log *DESATIVADO. Nenhuma requisicao enviada*.
2. Prepare a separately reviewed, inert BDS test pack with its **own** UUID and scoped permissions, a fixed HTTPS test endpoint, a dedicated test credential provided by a secure server-side mechanism, and no rewards, payments, live queue, or persistent scheduling.
3. Explicitly authorize any public sandbox enablement or test-credential creation before changing it. Nothing in the repo performs deployment or modifies MagnoHost.
4. Require empty poll results and HTTP 409 for ACK, negative tests for invalid token/timestamp/replay and a rollback to Worker disabled. Capture only redacted HTTP status, never credentials.
5. Before *real* delivery, review cryptographic request binding, token rotation, nonce expiration/retention, offline player identity, exactly-once/idempotency semantics, refund races, and independent grants approvals.

Tests added: `tests/delivery-bds-cloudflare-contract-gates.test.tsx`; they exercise source compatibility and mock HTTP contracts without network, not true BDS HTTPS.
