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
2. **BDS compatibility (not validated yet)**: confirm that the deployed Bedrock server's `@minecraft/server-net` version supports the required HTTPS request headers and local secret injection, with no token in the addon, world files or log output.
3. **Actual HTTPS (not validated yet)**: requires separate authorization to enable the sandbox only with fake test credentials and guaranteed empty delivery responses, then verify TLS, origin controls, invalid auth, and disabled ACK. Keep the public Worker disabled until approved; never use live payment/customer data.
4. **Security review before any real delivery**: the present token is a shared bearer credential, **not request signing/HMAC**. A captured valid request may be accepted with a new unused nonce if the token is compromised. Evaluate keyed request signatures bound to method/path/body/timestamp/nonce, secret rotation, storage retention, exact trust boundaries, and offline/ACK/idempotency/refund behaviors before granting items.
5. **Real operations**: require explicitly authorized staged rollout with risk controls and a rollback plan. No implementation in this branch authorizes grants.

## Windows

The local script uses `cmd.exe` directly to run the Wrangler `.cmd` shim without Node's `shell:true` warning DEP0190. The command executes only local Wrangler with temporary paths. If a path includes shell metacharacters, the script refuses to run rather than interpolating it.
