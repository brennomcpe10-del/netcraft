# NetCraft Delivery v0.3.0 — Pix Orders → private TEST outbox → isolated Core bridge
Date: 2026-11-01. Branch: `redesign-mobile-solaris` **only**.

## Verified before this milestone
- Owner's local BDS 1.26.61.1 v2.2.9 clone applied the fixed kit (3 diamonds + 6 iron), then two 1-day Explorer fixtures. Core showed ~1d23h and the owner reported no duplicates after reconnect/restart.
- Windows cleanup produced `NCBR_NETHERNET_PHONE_CLEANED`, `NETCRAFT_SUITE_CLEANED_FIREWALL_RESTORED`; original BDS-specific firewall rules both showed `True / Block`.
- These were synthetic, trusted localhost fixtures. **No real/test Pix order had yet caused a Minecraft grant**.

## Implemented in repository
- `server/delivery/isolatedPixOutboxBridge.ts`: **test-only** backend contract, not mounted in a route, Worker or BDS pack.
- Reads exactly one private `pixTestOrders` plus matching `pixTestDeliveries` record. Rejects missing, refunded, pending, blocked, malformed, production, invalid gamertag, unexpected line, changed plan, and `dispatchEnabled:true`.
- Independently invokes authenticated `gateway.me()` and `gateway.get(providerOrderId)`; uses existing `verifyOrder` and `ordersState` to confirm amount, receiver, Pix transaction IDs and `processed/accredited` state. A webhook alone or local approved flag never authorizes delivery.
- Recompiles the canonical item payload via `previewDeliveryPlan` + `draftCoreDelivery`, checking equality with the saved draft.
- VIPs require an explicit per-product mapping for existing `ncbr:vip_explorer`, exactly `30 dias` / 30 days, quantity 1. No automatic name-to-tag conversion. The test Core starts the term at **first grant**, not at an invented provider approval timestamp.
- On online-player offer, atomically records a fingerprinted durable lease in `pixTestBridgeLeasesV03`. Offline → hold. Concurrent re-offers and uncertain post-offer failures → **manual review** (no silent regrant). Receipt-based `applied` / `already_applied` ACK is idempotent. Refund after ACK is flagged for review. An order refund/change between offer and ACK is checked again.
- Strict process isolation: requires `NODE_ENV=test`, local Firestore emulator `127.0.0.1:8085`, and **rejects Vercel, Mercado Pago credentials, production Firebase credentials and active Cloudflare sandbox**. This code cannot run against online Firestore and does not mutate site or user data.
- `tests/delivery-isolated-pix-bridge.test.tsx`: offline, pending, wrong receiver, altered reward, mapping, duplicate, ACK, refund race, and environment gates.
- `tests/pix-emulator.integration.ts`: complete **emulated** test purchase: quote → mocked Orders provider GET approval → existing private Pix TEST outbox → independently verified bridge → concurrent kit/VIP leases → ACK → restart/replay → refund. The *Firestore* is a real local emulator; the Mercado Pago provider is intentionally mocked and the Minecraft executor is not called.

## Off-by-default BDS transport prepared
- `minecraft/delivery-e2e-local/verified_outbox_server.cjs`: separate HTTPS loopback adapter. Only preselected deterministic test order-line IDs can be offered, and only by the injected verified emulator bridge. Scoped opaque BDS token, single-use server-issued nonce, timestamp, bounded body and strict ACK.
- `minecraft/delivery-e2e-local/verified_outbox_protocol.js`: separate canonical validator accepting ONLY `simulation:true`, `environment:'verified_pix_emulator'`, `dispatchEnabled:false`, matching player/order and vanilla items or the explicit Explorer rank. All unknown executable fields are rejected. This is not the old hardcoded synthetic fixture validator.
- `minecraft/delivery-e2e-local/delivery_verified_outbox_bds.js`: optional BDS-only script targeting `127.0.0.1:18443`. Requires the new `ncbr_pix_emulator_enabled` toggle and `ncbr_pix_emulator_token` SecretString; refuses running alongside the old synthetic lab toggle. No code is installed or activated on MagnoHost.
- `minecraft/delivery-e2e-local/test-verified-outbox.mjs`: TLS challenge/poll/ACK/restart simulation and payload forgery rejection, run by Preview CI.
- `tests/delivery-pix-emulator-bds-gates.test.tsx`: static isolation guards.

The optional BDS source has **not** been packaged or live-installed into the user's server; it is deliberately separate from the proven v2.2.9 pack. A successful Node/mock transport test does not count as a real BDS-to-verified-Pix-grant run.

## Evidence and limits
The Mercado Pago Orders developer test procedure uses predefined data (including `first_name: APRO`) and may subsequently report test approval on GET. A GET verifying a test provider status is **not** a bank settlement or authorization for production sales. See:
- https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix
- https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications

**Not yet delivered:** a dedicated non-production secret-protected HTTPS bridge that consumes those private leases from an actual BDS, a true Preview/Mercado Pago test order completed into Minecraft, distributed lease fencing, inventory-full real-world test with a genuine order, complete refund reversal policy, and 30-day VIP expiry. None are represented as passing.

Production blockers remain: approved real-money orders must not flow via this test bridge; deploy a separate private durable transactional queue, server-authorized VIP registry, audited reconciliation, tested offline/partial-grant recovery, independent refund handling, and appropriate hosting/secrets. Existing `dispatchEnabled:false`, site checkout and the original BDS v2.2.9 remain unchanged.

## Operator actions
None now. Original Windows lab was cleaned. Do **not** rerun v2.2.9 or change MagnoHost/Production. A future full end-to-end provider TEST → BDS run requires a *separate*, reviewed, non-production deployment and an explicit test-world installation.
