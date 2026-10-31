# NetCraft Delivery — BDS ↔ Cloudflare protocol compatibility review

Status: **NOT CONNECTED**. This review introduces no active network calls, no BDS install, no live credentials, payments, ACKs, or grants.

## Verified in source
| Layer | Present contract | Critical boundary |
| --- | --- | --- |
| Cloudflare `sandbox/cloudflare/worker.mjs` | Test-only `x-nc-bds-token`, timestamp, 32-hex nonce; poll returns `[]`; ACK HTTP 409 | Published `wrangler.toml` stays disabled |
| `bedrockSecretHeaderTransport.js` | `@minecraft/server-net` POST and `@minecraft/server-admin` secrets/variables, gated by `nc_delivery_test_enabled` | Inert; not imported by a pack; `HttpHeader` accepts opaque `SecretString`, which is not an HMAC key |
| `signedHttpsBridge.js` | HMAC of method, route, time, nonce and JSON body; signature injected via option callback | No actual BDS signer/secret bridge; **different protocol from Cloudflare Worker** |
| `client.js` + local Express simulation | Node.js HMAC test harness and simulation-only routes | Local-only; not the Cloudflare Worker; no real delivery |
| `adapter.js` | In-memory offline, duplicate ACK, refund states | Resets with process; test-only and no reward mutation |
| Firestore emulator store | Demo job transactions, idempotency, refund state | Only the isolated Firestore emulator, not real queue |

**Do not assume these components interoperate.** The Cloudflare token protocol is distinct from the local HMAC simulation, and the isolated Worker currently has no backing delivery queue. In particular, a valid simulated local ACK does not imply that the Cloudflare ACK endpoint will accept it (it deliberately returns 409).

## BDS SecretString and network preflight

Before making a BDS test pack, independently verify the actual MagnoHost engine and BDS version, the resolved `@minecraft/server-net` and `@minecraft/server-admin` module versions, and host support for per-pack permissions, server variables and secret injection. Do not add tokens to a manifest or share raw credentials. Verify the outbound HTTPS host restriction and TLS handling on a **separate explicitly authorized test instance**. Documentation and static import syntax alone cannot prove installed-host compatibility.

A `SecretString` is intentionally opaque. Constructing an `HttpHeader` using it does **not** prove that arbitrary HMAC signing is supported. For a future audited test, choose ONE protocol and authenticate a single fixed endpoint with scope-limited test credentials; do not turn on seed/refund or jobs/grants.

## Safety cases for later controlled end-to-end tests

- A player offline at poll time must remain waiting; joining later may permit **simulated** ACK only.
- Duplicate job IDs must not cause repeated application; conflicting metadata should be rejected.
- A blocked/refunded job must not transition to completed even if the player later joins.
- Cross-restart replay protection must apply at the server, not only in an in-memory BDS adapter.
- Cloudflare ACK must remain rejected and Cloudflare poll must return empty jobs until explicit authorization for a separately reviewed non-production contract.
- Test nonce retention and expiry, bounded memory/storage, request authentication, rate limiting, observability without secrets and safe recovery before exposure.

Automated simulator tests: `tests/delivery-bds-offline-idempotency-gates.test.tsx`. They prove only the in-memory simulation state transitions; they do not verify MagnoHost runtime behavior.

No changes to public Cloudflare Worker, Vercel Production, main, payment credentials, live data, or Minecraft addons are authorized here.
