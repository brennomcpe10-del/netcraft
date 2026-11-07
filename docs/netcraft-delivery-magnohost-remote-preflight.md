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

**Caution:** Vercel Preview deployment protection may deny requests from BDS.
A 401/403 is not evidence that port 443 is blocked. The future MagnoHost test
must use a genuinely reachable, authorized Preview endpoint; do not disable
Preview protection or expose credentials to make this test pass.

## Independent Bedrock preflight pack

Source: `minecraft/delivery-magno-preflight/bp`.
Name: `NetCraft Delivery Magno HTTPS Preflight OFF`, version `0.1.0`.
This is **not** a NetCraftCore update, has distinct BP and module UUIDs,
and does not require RP.

The pack remains OFF unless **both** server-admin variables equal boolean
`true`:

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
Otherwise it stays OFF or reports a read-only connection error. It never
retries, scans players, changes worlds or delivers any purchase.

## Deployment boundaries and next step

- No MagnoHost access/configuration has been performed, and no
  Preview -> MagnoHost remote run is claimed.
- No `main`, Vercel Production, public Cloudflare Worker, real Pix,
  VIP activation, customer data or live Minecraft files are changed.
- CI and the Vercel Preview build must pass before using this artifact.
- Later, the owner can authorize exactly **one remote MagnoHost test** after
  confirming the target Preview URL is reachable without forbidden bypasses.
  If successful, only the **network capability** is established: authenticated
  checkout -> private gateway -> verified player -> real VIP is a separate
  commercial-release gate.

Prior tests that already passed should not be requested again.
