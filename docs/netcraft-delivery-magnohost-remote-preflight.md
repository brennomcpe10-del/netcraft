# NetCraft Delivery: MagnoHost -> NetCraftBR remote HTTPS preflight (OFF)

## Result and scope

This branch contains the **code** for a remote BDS -> NetCraftBR HTTPS
connectivity check, not proof that MagnoHost has successfully contacted it.
The earlier Windows BDS v2.3.30 lab already demonstrated local HTTPS,
synthetic VIPs, ACK and restart without duplication. Do **not** repeat it.

## Server-side endpoint

- Deployment: Vercel **Preview only** on `redesign-mobile-solaris`.
- `GET /api/delivery/remote-preflight/health`: inert contract, HTTP 200.
- `POST /api/delivery/remote-preflight/ping`: exact JSON
  `{"schema":1,"probe":"netcraft.delivery.remote-preflight.v1"}`, HTTP 200.
- Neither endpoint accepts tokens, customer details or arbitrary payloads.
- Every successful response has `simulation:true`,
  `dispatchEnabled:false`, `grantsEnabled:false`,
  `ackEnabled:false`, `realPayments:false`.
- Production / local / non-Preview: HTTP 503. Unrecognized operations: 405.
- No Firestore reads/writes, payments, order states, VIPs, inventory,
  reward dispatch, status ACK, nonce issuance or user identities.
- This route is **not** `/api/delivery/bds`, which remains a separately gated
  commercial candidate.

**Verified project setting (2026-11-07):** Vercel project configuration
currently reports `deploymentProtection.enabled=true` and
`deploymentType=all_except_custom_domains`. The Preview deployment built
successfully, but its endpoint is **not confirmed externally reachable**.
A MagnoHost BDS request to the Preview URL may receive 401/403 from
deployment protection, independent of any HTTPS/443 capability.
The Bedrock module reports `PREVIEW_PROTECTED_401_403` separately from
`PREVIEW_ENDPOINT_404` and `HTTPS_GET_POST_BLOCKED`.

Do not disable deployment protection, expose authorization credentials, or
interpret the current Preview deployment as a confirmed live BDS endpoint.
An independently authorized reachable test origin is still needed.

## Independent Bedrock preflight pack

Source: `minecraft/delivery-magno-preflight/bp`.
Name: `NetCraft Delivery Magno HTTPS Preflight 0.1.1 OFF`, version `0.1.1`.
This is **not** a NetCraftCore update, has distinct BP and module UUIDs,
and does not require RP.

The pack remains OFF unless **both** server-admin variables equal boolean
`true` **and** a separate server-admin secret has been configured:

- `ncbr_magno_preflight_enabled`
- `ncbr_magno_preflight_preview_only`

A third non-secret variable, `ncbr_magno_preflight_origin`, must be an exact
approved deployment origin, e.g. an HTTPS Vercel Preview hostname for this
specific project. The client rejects embedded paths, ports, queries, credentials,
HTTP, arbitrary domains, and unrelated projects.

The host's addon-specific `config/<module-uuid>/permissions.json` must
explicitly allow `@minecraft/server-net` and **only** the two endpoint
URLs for the selected Preview origin. This security policy is **not** created
or modified in MagnoHost by this commit.

When explicitly enabled, the pack sends one GET and one POST at startup.
Expected BDS log:
`[NCBR MAGNO PREFLIGHT] HTTPS_GET_POST_PASS_NO_DELIVERIES`.
Otherwise it stays OFF or reports a read-only connection error; a missing
Vercel authentication secret produces `BYPASS_SECRET_NOT_CONFIGURED`. It never
retries, scans players, changes worlds or delivers any purchase.

## Deployment boundaries and next step

- No MagnoHost access/configuration has been performed, no automation
  bypass token has been generated, and no Preview -> MagnoHost remote
  run is claimed.
- No `main`, Vercel Production, public Cloudflare Worker, real Pix,
  VIP activation, customer data or live Minecraft files are changed.
- CI and the Vercel Preview build must pass before using this artifact.
- Later, the owner can authorize exactly **one remote MagnoHost test** after
  confirming the target Preview URL is reachable without forbidden bypasses.
  If successful, only the **network capability** is established: authenticated
  checkout -> private gateway -> verified player -> real VIP is a separate
  commercial-release gate.

Prior tests that already passed should not be requested again.

## Protected Preview authentication and host configuration

The Vercel Preview is protected. The Bedrock pack version 0.1.1 reads
`secrets.get("ncbr_magno_vercel_preview_bypass")` and passes the result
directly as an opaque `SecretString` into the HTTPS
`x-vercel-protection-bypass` header. It never converts, embeds or logs it.
If the secret is absent, the pack sends **no HTTP requests**.

Vercel Protection Bypass for Automation secrets are **project-wide**:
they can access *any protected deployment* of the project until revoked,
not just the read-only diagnostic. Therefore this update does NOT generate
an unattended long-lived bypass secret. Creating a temporary credential
requires an operator capable of securely installing and revoking it,
preferably in a separate disposable test project. No production token,
live Mercado Pago, BDS Delivery token, Discord key or Firebase key may
be reused here.

For a separately authorized single MagnoHost test, configure the
**server-only**, pack-module settings at:

`config/c1abc66e-8354-4ca1-a671-2bcc9c180346/`

- In `variables.json` set `ncbr_magno_preflight_enabled=true`,
  `ncbr_magno_preflight_preview_only=true` and
  `ncbr_magno_preflight_origin` to the exact Vercel Preview HTTPS origin.
- In `permissions.json`, allow `@minecraft/server-net` to contact only
  `/api/delivery/remote-preflight/health` and `/ping` on that origin.
  Keep `force_tls=true` and do not widen permissions.
- In the **private** `secrets.json`, set the name
  `ncbr_magno_vercel_preview_bypass` to the temporary Vercel bypass
  secret. **Never put the value in the .mcpack, GitHub, the chat or logs.**
- If MagnoHost cannot store server-admin `SecretString` or set per-pack
  network permissions, do **not** activate the probe. Do not attempt
  to bypass the missing host controls.
- Immediately after the single test, disable both opt-in flags, remove
  the secret from the BDS host and revoke the temporary Vercel bypass.

Exact header: `x-vercel-protection-bypass`. Do not use a query-string
token, which can be logged. No bypass credential was created in this
commit, and the Preview protection was never disabled.

**Evidence boundaries:** a future successful GET+POST proves MagnoHost
HTTPS connectivity to this specific route, not commercial order validation,
Xbox identity or actual VIP delivery. The BDS-v2.3.30 local synthetic
E2E that already passed must **not** be repeated.
