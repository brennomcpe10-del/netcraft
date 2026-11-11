# NetCraft Delivery Pix v0.3.1 — BDS clone-only read-only preflight

**Status:** source + isolated CI artifact only. NOT a production delivery addon.
Branch: `redesign-mobile-solaris` (never merge without review).

## Scope
- Separate addon, identity `bd4cd42e-f32f-4ca2-8f9c-ce73377cabf9`, version **0.3.1** in header/module, opt-in BDS-only.
- Off by default: requires the explicitly true server variable `ncbr_pix_v031_preflight_enabled`, plus synthetic `ncbr_pix_v031_preflight_token` in BDS server secrets (never in repo, manifest, world, chat or logs), plus `ncbr_pix_v031_preflight_player` configured for the one disposable test player.
- Uses only `https://127.0.0.1:18443/delivery/challenge` then `/delivery/preflight`; rejects any response not tagged `simulation:true`, `environment:'verified_pix_emulator'` and `dispatchEnabled:false`, `grantsEnabled:false`, `ackEnabled:false`. Prints only PASS or FAIL_CLOSED without any secrets.
- The server preflight route verifies opaque BDS token, server-issued nonce, timestamp, exact player and loopback TLS. It **never** offers/leases jobs and therefore cannot strand an unacknowledged purchase. Replays rejected.
- The separate verified Pix bridge still uses the existing local Firestore emulator plus mocked provider approval; it is not mounted on public Vercel/Worker routes.

## Why no real grants yet
The reviewed up-to-date NetCraftCore v2.3.4 consumer addon does not expose the required tested delivery executor API to this separate package. A read-only pack MUST NOT call `/delivery/poll` because doing so would lease a job without a real Core receipt. It must not invent a world grant, ACK or VIP. Production delivery remains DISABLED.

## Clone-only prerequisites for a future operator test
1. Dedicated BDS 1.26.61.1 clone/backup with `@minecraft/server-net` and `@minecraft/server-admin` supported, matching module UUID scoped in permissions. Leave regular server/MagnoHost untouched.
2. Isolated local HTTPS server with ephemeral TLS certificate trusted only within the disposable lab; local Firestore emulator `127.0.0.1:8085`, test-only provider fixtures and 64-hex disposable token configured privately. No real Mercado Pago/Firebase credentials.
3. Explicitly opt-in with `ncbr_pix_v031_preflight_enabled=true` only in cloned BDS, set player variable and synthetic SecretString. Confirm `[NCBR_PIX_V031] AUTHENTICATED_READ_ONLY_PREFLIGHT_PASS` without any reward/ACK.
4. Turn off switch; remove scoped permissions, token, temporary certificate trust; restore lab firewall rules, stop HTTPS listener and BDS. Never loosen original public BDS firewall policy.

## Automated release gates
- `npm run lint` and `NODE_ENV=test npm test` via Preview CI.
- Verified HTTPS loopback test checks read-only preflight, nonce reuse failure, player isolation, no lease reservation, ACK-after-gateway-restart tests.
- `node scripts/build-bds-pix-preflight-v031.mjs` creates exact two-file OFF mcpack. CI inspects ZIP, manifest versions and the forbidden-source list before publishing a downloadable artifact for inspection.
- Mocked provider → real local Firestore → HTTPS verification of kit/VIP receipt remains a Node integration only. This is *not* real provider Pix TEST → BDS.

## Blockers before actual delivery
A BDS-clone-grant integration must use a compatible Core test executor, write-ahead durable receipts, inventory-full truth (not a client-supplied claim), offline recovery, rank/expiry semantics, reconciliation after uncertain failure and refund review. The separate provider test-order outbox must remain private, no production secret/creds or checkout pipeline. Production requires independent transaction/credential/incident review and staged release authorization.

`main`, Production, public Cloudflare Worker, Mercado Pago real credentials, MagnoHost, worlds, payments, and live players must not be touched by this artifact.
