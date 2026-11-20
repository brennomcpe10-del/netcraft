# NetCraft Delivery BDS E2E LAB — v2.2.8 (2026-11-01)

**Milestone:** bridge from authenticated synthetic HTTPS polling to an existing NetCraftCore delivery executor. This is NOT yet a Pix purchase delivery or production launch.

## Evidence
- User confirmed in vanilla Minecraft on cloned world: v2.2.7 script event `Teste items: applied` (2 iron ingots), then `Teste vip: applied` after registering Explorer. This validates the Core executor separately.
- Vercel Preview verified a test Merchant Orders API POST HTTP 201, GET 200 and both Pix QR fields returned (no confirmed settlement).
- The packaged **BDS-only** v2.2.8 lab variant adds server-net/server-admin dependencies and an internal bridge. The ordinary v2.2.7 client addon remains unchanged.
- The single local HTTPS lab fixture returns exactly two iron ingots to the chosen online test player. A separately configurable 1-day Core VIP fixture is available for later testing. A restricted `SecretString` token, 32-hex server-issued nonce, strict TLS and timestamp protect requests. ACK is sent only after the Core executor returns `applied` or `already_applied`.
- HTTPS Node integration tests cover auth, nonce replay, ACK receipt persistence after server restart, offline hold, refusing incorrect players and payload limits. Pure contract tests enforce fixture IDs, exact items, and guarded VIP rank.
- **BDS real HTTPS item execution is not yet tested**. A Windows isolated-world installer is provided with the addon and source bundle for a single next-stage real test, after reviewing the script and respecting firewall policies.

## Artifacts created in the conversation

- `NetCraftCore_v2.2.8_BDS_E2E_LAB_OFF.mcaddon`, SHA-256 `70f029d2bb48a4de1cb1af0c7532d4eac455f317ad5b05ab42a0e357f2406026`
- `NetCraftDelivery_v2.2.8_BDS_E2E_Prepare_Cleanup.ps1`, SHA-256 `fdcb92eccf3f22fea43ebb7dad0baa731fc9db43791954091285ad6951c190d3`
- `NetCraftDelivery_v2.2.8_E2E_Source.zip` includes the local HTTPS fixture, BDS bridge, protocol validator and automated tests.

## Safety boundaries

1. Only branch `redesign-mobile-solaris`; no changes to `main`.
2. Neither site Production nor Cloudflare public Worker is involved. Real payments and customer data are untouched.
3. Strictly localhost `https://127.0.0.1:18443`. BDS game server is a disposable clone with a synthetic secret, lab-only switch OFF by default, and restrictive firewall rules.
4. Only a server-issued fixed synthetic fixture can reach the Core engine. No server-side Pix queue, money, or product reward can be spoofed through user commands.
5. ACK does not solve all refund/chargeback or uncertain partial-grant cases. Real grants remain disallowed until private transactional queue, signed and audited contract, authorization, refunds, offline handling, rollback and end-to-end commercial testing are in place.

## Next milestone

Run a **single full localhost BDS test** with an online player: server offers fixed authenticated fixture → Core applies two iron ingots → BDS posts ACK → server persists receipt → a restart/replay does not award items twice. Only then connect a separate non-production, provider-confirmed test order outbox to this channel. Do not use MagnoHost or real credentials.
