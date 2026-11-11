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
2. **BDS compatibility (partial validation on 2026-11-01)**: a dedicated lab BDS 1.26.61.1 loaded `@minecraft/server-net` 1.0.0-beta and made a successful HTTPS GET with strict TLS against a local loopback health endpoint; Gate B previously checked synthetic `SecretString` as `HttpHeader` construction independently. **Authenticated HTTPS POST with SecretString was subsequently verified for localhost in Gate C.2 (see below)**. Never store a real token in addon code, world files, or logs.
3. **Actual HTTPS (localhost GET validated only)**: the lab BDS GET was successful after temporarily trusting the exact self-signed test certificate in the Windows current-user root store. **BDS → authenticated POST to localhost was subsequently validated in Gate C.2; public/test Cloudflare HTTPS origin, signature, and production protocol are NOT validated**. Keep the public Worker disabled; use no live payment/customer data.
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

## Evidence: Gate C.2 BDS authenticated HTTPS localhost — 2026-11-01

**Status: PASS for the isolated synthetic BDS-to-localhost scenario; post-test cleanup still requires confirmation.**

- User-supplied Windows PowerShell result: `GATE_C_HTTPS_HEALTH_PASS`, then `GATE_C2_LAB_PREPARED` for an isolated Windows BDS lab. The setup printed "sem entregas ou ACK".
- The official Bedrock Dedicated Server `1.26.61.1` started world `NetCraftGateC2`, with `gtst` experiment enabled, and loaded behavior pack `NetCraft Delivery Gate C.2 Local OFF` version `0.0.1` (`7ba25e40-c7a4-4f0a-a68e-17fc47f32c57`).
- **User-observed real BDS outcome**:
  ```text
  [Scripting] [GATE_C2_BDS] AUTHENTICATED_EMPTY_POLL_AND_REPLAY_PASS
  ```
- The dedicated, explicitly enabled Gate C.2 lab script uses `@minecraft/server-admin` `secrets.get` and `@minecraft/server-net` `HttpHeader` without coercing or printing the synthetic credential. It POSTs to `https://127.0.0.1:18443/delivery/challenge` and `/delivery/poll`. The local test server returns a cryptographically generated nonce; authenticated poll must return `{simulation:true, deliveries:[]}`; replay is expected to return HTTP 401. The successful console result is evidence these checks completed.
- No installed NetCraftCore behavior pack, real gamer accounts, payment, item/VIP delivery, or real ACK were used. This does **not** validate Cloudflare/remote origin, secret rotation, HMAC signing, remote trust, or a production rollout.
- Commit `47adf4de04b4db44d0694f5f01cb2166e3e1aed9`; CI run `41314915420`: success (206 passed, 0 failed, 1 skipped), including loopback TLS contract tests and PowerShell parsing.
- Temporary localhost certificate trust and the synthetic module token must be removed after calling `stop` on BDS and running `powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "$env:USERPROFILE\Downloads\gate-c2-windows-lab.ps1" -Mode Cleanup`. **Do not mark cleanup PASS until the user reports `GATE_C2_LAB_CLEANED`.**

**Scope:** only the local short-lived test setup is proven; the public Worker remains disabled. No changes to `main`, Vercel/Cloudflare Production, MagnoHost, payment processing, or real deliveries are authorized.
