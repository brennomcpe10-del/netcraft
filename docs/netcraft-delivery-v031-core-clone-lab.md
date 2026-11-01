# NetCraft Delivery v0.3.1 — clone-only executable Core lab

Status: **local packaged artifact, CI unit-test reference and BDS clone integration only**.
Production, MagnoHost, real payments, existing user data, public Cloudflare Worker and `main` remain untouched.

## Core v2.3.5 BDS LAB OFF
Built from the owner's supplied `NetCraft_Core_v2.3.4_Reliquias.mcaddon`, with two modified source modules:
- `scripts/core/main.js` creates a lab executor and boots the optional existing BDS HTTPS adapter.
- `scripts/essentials/Modules/VIPSystem.js` adds `grantDeliveryVIPLab`, a strict Explorer/30-day wrapper around existing `saveVIP` and renewal policy.

New scripts: `scripts/core/delivery_lab_v031.js` (included alongside this reference), `delivery_bds_v031.js` (clone-local version of existing `minecraft/delivery-e2e-local/delivery_verified_outbox_bds.js`) and its strict response protocol. BP/RP names, header/module versions and cross-pack dependencies consistently updated to **2.3.5**, not 2.3.4. Adds BDS-only dependencies `@minecraft/server-net` and `@minecraft/server-admin`. Does not merge into Core public production.

The Core executor uses world dynamic-property write-ahead receipts per deterministic delivery ID. On a second offer it returns `already_applied`; an uncertain `started` receipt is quarantined. Kits use `ItemStack` and conservative empty-inventory-slot preflight. VIP grants call the *existing* VIPSystem registration and 30-day extension (not merely a tag). Existing Explorer rank must be configured. Offlined and inventory-full executions do not create receipts.

**Not commercial-release ready:** Core world properties and its VIP Database asynchronous flush are not a distributed payment/database transaction. Crash between a write-ahead receipt, grant and flush requires manual reconciliation. The local outbox uses mocked TEST provider status, not a genuine Pix payment; no real end-to-end BDS execution has been observed in this chat.

## Tests
`node --test tests/delivery-core-v031-clone.test.mjs` runs pure executor tests in CI. The separately generated addon and its manifest integrity were locally verified, but the specific BDS binary/runtime still needs a real cloned-world test.

## Authorized next gate
In a disposable BDS 1.26.61.1 clone, with a valid short-lived loopback TLS test certificate, trusted privately supplied `SecretString` token, module-scoped server-net permission and private Firestore emulator, run the authenticated TEST outbox and confirm distinct kit and VIP grants, restart, replay, offline, inventory-full and refunds. Never install this addon on MagnoHost or production before an independent review.

No actual provider credentials, customer records, bank settlement, webhook secret or public endpoint are included.
