# NetCraft Delivery v2.3.28 — LAB OFF authenticated-transport evidence

This stage is strictly for the local offline homologation environment.

## Confirmed local proof

The downloadable lab package `NetCraftCore_v2.3.28_LAB_OFF_Ponte_HTTPS_Autenticada_Emulador.zip` contains a real loopback HTTPS server and a **Node.js BDS-client simulator**. It tests:

- HMAC-SHA256 signatures compatible with `server/delivery/bdsSignedRequest.ts`;
- canonical `netcraft-delivery-v1` messages over POST, action, timestamp, nonce and body SHA-256;
- 60-second time-window validation, invalid signature rejection and durable nonce replay prevention;
- synthetic-only lease, ACK idempotency, safe NACK, and manual-review on ambiguous/restarted leases;
- local TLS to `127.0.0.1` with an explicitly **public test certificate** and an ephemeral HMAC key.

The package's BDS addon provides a **read-only console probe**:
`scriptevent ncbr:lab_auth_probe_v2328 STATUS_SOMENTE_LEITURA`.

**Important:** this is **not a network bridge running inside BDS**. Bedrock still has no authenticated remote polling, and its firewall must stay blocked in both directions. Do not send payment data or HMAC secrets in a `scriptevent`. A console probe cannot substitute for authenticated BDS transport or Xbox identity validation.

## Release blockers

- Authenticated and identity-bound BDS-to-Delivery transport must be separately implemented and tested.
- No real VIPs, payments, Production tokens, MagnoHost operations or deliveries can be enabled from this LAB package.
- The installed Core still logs degraded protections (`beforeEvents.playerPlaceBlock`, `beforeEvents.chatSend`, and `Events`).
- A signed request alone is not authorization for a payment or a grant: it must be coupled with independent provider verification, durable transactional lease/receipt and verified Xbox identity.

## CI coverage

`tests/delivery-v2328-hmac-contract.test.tsx` is automatically included in the existing `npm test` suite and checks the signing/replay contract with a transaction stub, with no network or external credentials.

## Deployment safety

Work only on branch `redesign-mobile-solaris`. Never touch `main`, Production, Cloudflare public Worker, Mercado Pago credentials, or MagnoHost from these tests.
