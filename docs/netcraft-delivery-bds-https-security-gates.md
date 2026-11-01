# NetCraft Delivery — BDS/HTTPS security gate (pre-deployment)

This is **preparation only**. No Cloudflare deployment, Vercel change, Minecraft pack activation, credentials upload, payments, or real grants.

## Contract currently implemented

- The sandbox Worker accepts JSON POST to `/delivery/poll` and `/delivery/ack` only when explicitly enabled in the **local-only test configuration**.
- Authentication uses a test-only `x-nc-bds-token` header, a 13-digit millisecond `x-nc-timestamp` within ±60 seconds, and a 32-character lowercase hex `x-nc-nonce`.
- Distinct nonces must be generated with cryptographic randomness; each nonce can be claimed at most once.
- A valid `/delivery/poll` must return `{"deliveries":[],"simulation":true}`. An authenticated `/delivery/ack` must return HTTP 409 with `{"error":"ack_disabled","simulation":true}`.
- Public Worker remains `NC_SANDBOX_ENABLED="false"`; default `wrangler.toml` is unchanged.

## Validation before external HTTPS exposure

1. **Local real SQLite**: run `node scripts/test-cloudflare-workerd-local.mjs`; verifies persistence across process restart, 24 parallel claims, rejection of invalid test tokens, stale/future timestamps, and ACK-disabled state. This uses loopback HTTP because no external network is involved.
2. **BDS compatibility (partial validation on 2026-11-01)**: a dedicated lab BDS 1.26.61.1 loaded `@minecraft/server-net` 1.0.0-beta and made a successful HTTPS GET with strict TLS against a local loopback health endpoint; Gate B previously checked synthetic `SecretString` as `HttpHeader` construction independently. **Authenticated HTTPS POST with SecretString remains unverified**; never store a token in addon code, world files, or logs.
3. **Actual HTTPS (localhost GET validated only)**: the lab BDS GET was successful after temporarily trusting the exact self-signed test certificate in the Windows current-user root store. **BDS → authenticated POST, public/test Cloudflare HTTPS origin, signature, and live protocol are NOT validated**. Keep the public Worker disabled; use no live payment/customer data.
4. **Security review before any real delivery**: the present token is a shared bearer credential, **not request signing/HMAC**. A captured valid request may be accepted with a new unused nonce if the token is compromised. Evaluate keyed request signatures bound to method/path/body/timestamp/nonce, secret rotation, storage retention, exact trust boundaries, and offline/ACK/idempotency/refund behaviors before granting items.
5. **Real operations**: require explicitly authorized staged rollout with risk controls and a rollback plan. No implementation in this branch authorizes grants.

## Windows

The local script uses `cmd.exe` directly to run the Wrangler `.cmd` shim without Node's `shell:true` warning DEP0190. The command executes only local Wrangler with temporary paths. If a path includes shell metacharacters, the script refuses to run rather than interpolating it.

## Evidence: Gate C BDS HTTPS localhost GET — 2026-11-01

User-observed console on isolated Windows lab `C:\\NetCraft-Lab\\BDS-GateA`:
- BDS version: **1.26.61.1**; world **NetCraftGateC**; `Experiment(s) active: gtst`.
- Pack loaded: `NetCraft Gate C Local` (0.0.1), with an independently scoped test module and `@minecraft/server-net` 1.0.0-beta.
- Local-only target: `https://127.0.0.1:18443/health` via `GET`; response contract `{"simulation":true,"deliveriesEnabled":false,"ackEnabled":false}`.
- First attempt failed with `InternalHttpRequestError 0x80072f8f`, consistent with TLS/certificate verification failure.
- The exact, locally created, short-lived `CN=localhost` test certificate was temporarily imported to **Cert:\\CurrentUser\\Root** (only the current Windows user), without disabling certificate verification.
- Confirmed `GATE C WINDOWS TLS PASS!`, followed by the BDS log:
  ```text
  [Scripting] [GATE_C_BDS] Starting HTTPS health test
  [Scripting] [GATE_C_BDS] HTTPS_HEALTH_PASS
  ```
- Existing lab firewall block rules were checked by the setup scripts and not changed; success is specifically for the loopback endpoint, not internet access.
- No credentials were sent, no delivery or ACK route was invoked, and no changes were made to production, MagnoHost, main branch or public Cloudflare Worker.
- The localhost Node diagnostic exposes `GET /health` only and never enables deliveries or ACK.

**Scope of PASS:** verified a real HTTPS request from the official BDS Script API to a local Node server with Windows certificate trust. This does **not** validate authenticated POST headers, challenge/nonce, remote TLS, idempotency, payments, grants, or production operation.

**Mandatory lab teardown:** stop BDS with `stop`; terminate the identified Gate C Node HTTPS listener after verifying its command-line ownership; remove only the exact temporary lab certificate thumbprint from `Cert:\\CurrentUser\\Root` (if present). Keep normal certificate verification, Windows Defender, and lab firewall protections enabled. Retain or delete private test data only through a separate reviewed cleanup process.
