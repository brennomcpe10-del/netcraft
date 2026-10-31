# Delivery Homologacao OFF v0.1 — PRE-FLIGHT ONLY

The independently packaged .mcpack from `preflight-pack/` has one script and no reward, payment, player, network, polling, ACK or secret access. The only effect is a console line on startup. It is intentionally NOT the authenticated delivery-client candidate.

Before any MagnoHost activation: back up the world and test on a cloned BDS instance. `@minecraft/server-net` may be unavailable unless the per-module UUID `99ac2e49-b003-46fc-8473-55700984acc7` is separately permitted. Do NOT change global/default permissions, do NOT copy secrets, and do NOT enable any delivery or payment feature.

The authenticated transport code is NOT included. The loopback TLS server remains local; a publicly accessible isolated HTTPS sandbox has NOT been provisioned. No guarantee about secure nonce availability in BDS: secureNonce32 deliberately fails closed when the runtime has no trustworthy `crypto.getRandomValues` equivalent. A header-token prototype does not prove authenticated end-to-end operation without a real test host and runtime.

A later release requires reviewing nonce source, scoped authentication, connectivity, refund safety, idempotency, request leasing/ACK semantics and BDS module compatibility before any active testing.


## Opaque header prototype (still OFF)

` scripts/secretHeaderProbe.js ` is an unreferenced helper for **future** `SecretString` → `HttpHeader` validation; the actual entrypoint does not import or call it. It does not send HTTP requests. The pack uses its own module UUID (`99ac2e49-b003-46fc-8473-55700984acc7`) and must not reuse the existing HTTPS diagnostic UUID. This addition is **not** proof of `SecretString` compatibility with the actual BDS runtime.

No installation on MagnoHost, no edits to `config/default/permissions.json`, no tokens in files, and no Cloudflare enablement are authorized. Offline/ACK/idempotency checks remain simulations; Cloudflare ACK is explicitly disabled.


## Validation checkpoint — 2026-10-31

The owner has **already passed** a real local Windows test using Wrangler 4.156.0, SQLite Durable Object, and `NC_TEST_CHALLENGE_EXPIRY=1`. The final output was:

`PASS: local SQLite DO issued challenges, restart, replay, concurrency, stale token/time and disabled ACK`

This confirms local challenge emission, expiration, 24-way concurrent claim, replay denial, restart persistence, invalid token/time checks and blocked ACK. **Do not ask for this test to be repeated.**

### Remaining, distinct BDS runtime gate

This pack's `scripts/main.js` is deliberately OFF and does **not** import `secretHeaderProbe.js`. That probe now returns `opaque_header_unavailable` on API exceptions without exposing runtime messages or secret material. This is only preparation; its function has not been executed on an actual BDS.

To verify Bedrock compatibility later, obtain explicit approval to use a **cloned** BDS 1.26.61.1 server, with a separate test-only secret in Bedrock server secret storage and per-module permissions scoped to this pack UUID. The probe must remain an explicitly triggered, non-network diagnostic before any authenticated HTTPS test. Keep the Cloudflare public Worker disabled; localhost Workerd is not externally reachable from MagnoHost.

No production installation, payment, reward grant, ACK, or public Worker deployment is authorized.
