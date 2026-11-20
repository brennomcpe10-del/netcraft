# NetCraft Delivery — isolated BDS/Cloudflare authentication checkpoint

## Confirmed

The owner tested Bedrock Dedicated Server **1.26.61.1** outbound GET to `https://example.com/` and received HTTP 200. The diagnostic was then returned to `nc_https_probe_enabled=false` and the BDS restarted. This proves only outbound HTTPS reachability for the allowlisted host, not a signed/secret-bearing POST to Cloudflare.

The local Cloudflare Worker uses a bearer **test** token, 13-digit timestamp (±60 seconds), cryptographically random 32-character hexadecimal nonce and an atomic Durable Object nonce claim. The real local workerd/SQLite integration previously passed 24 concurrent same-nonce calls and persistence across a workerd process restart. The public Worker is still configured **disabled** by default.

New regression file: `tests/delivery-bds-cloudflare-auth-invariants.test.tsx`. Checks:
- Invalid token or stale timestamp never consumes the nonce.
- Invalid player and malformed ACK identifiers never consume the nonce.
- Valid isolated polls return zero jobs and ACK is rejected with HTTP 409.
- Unsupported seed/refund endpoints do not reach nonce storage.

This is a **mock transport test**; it does not use BDS, TLS, Cloudflare production, real secret storage or real customers.

## Must remain blocked

1. Never add the real Cloudflare token to addon `manifest.json`, `scripts/`, `variables.json`, screenshots, logs, GitHub or chat. A server-side `@minecraft/server-admin` `SecretString` should remain opaque, used only in the permitted HTTP header after an explicitly reviewed test configuration.
2. Bedrock's `HttpHeader("x-nc-bds-token", SecretString)` support on BDS 1.26.61.1 needs a separate, authorized test. Loading `server-net` or successfully doing GET is not proof of opaque credential transport.
3. The present public Cloudflare Worker remains disabled; its token header protocol does not yet enforce HMAC body signing. The HMAC simulation and Worker are separate, and MUST NOT be presented as a fully integrated delivery solution.
4. A dedicated opt-in, inert Bedrock test pack should have its *own* module UUID and narrow network permissions. No reuse or expansion of global permissions. No real stores or deliveries.
5. The Cloudflare sandbox must not be enabled publicly without explicit authorization and safety review; until then use only local workerd and simulated fixtures.
6. Offline/online player state, ACK persistence, refund race handling and exactly-once granting have only been simulated; no real delivery implementation is approved.

Existing unrelated startup warnings in TikTok, VCMC and Discord packs should be addressed in independent maintenance, not by loosening security for the delivery diagnostic.
