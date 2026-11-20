# NetCraft Delivery — nonce/SecretString release gate (2026-10-31)

The BDS 1.26.61.1 pack remains **OFF**. No standalone script is imported by the pack entrypoint beyond the inert logger. Do not install or enable a network-capable add-on on production MagnoHost.

## Authenticated HTTPS prerequisites

- Opaque `SecretString` can only be used through the runtime-supported `HttpHeader` API, not printed, embedded in packs or sent to logs. Source-level imports are not proof of working BDS authentication.
- `secureNonce32` expects an injected cryptographic `getRandomValues` provider, which must return the filled Uint8Array. Missing/unusable providers fail closed. The code never uses `Math.random`. **A secure provider available inside BDS has not been verified.**
- UTC millisecond timestamps must be within the Cloudflare Worker 60-second window, and server clock skew must be checked before requests are permitted.
- The Cloudflare sandbox Durable Object claims each nonce once; a replay returns 401. Local workerd has been tested, but neither this nor unit mocks proves external MagnoHost/Cloudflare authenticated POST.
- The isolated Worker serves no real jobs. POST /delivery/poll can only return `{"deliveries":[],"simulation":true}`. POST /delivery/ack returns 409, and the client must never treat a success-shaped ACK as authorized.
- Offline players cannot receive simulated grants. Real durable idempotency, delivery commitments and refunds remain separate incomplete features.

## The first future authorized manual test

Only after CI passes and a safe nonce source plus isolated HTTPS test destination have been independently verified: use a cloned server, a dedicated module UUID and explicitly scoped `@minecraft/server-admin`/`@minecraft/server-net` permissions, plus a short-lived test token stored server-side as a secret. Never paste that token into chat or GitHub. Keep the public Cloudflare Worker disabled and don't configure real rewards. Confirm missing token, wrong token, nonce replay, stale timestamp, OFF switch, offline-player guard, zero-job responses and ACK disabled.

Nothing in this checkpoint installs, deploys, publishes, grants permissions or changes any hosted service.
