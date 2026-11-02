# NetCraftCore real v2.3.20 → v2.3.21 (Delivery LAB OFF)

User-provided Core file: `NetCraft_Core_v2.3.20_Reliquias_Remotas_Procurado_Amarelo.mcaddon` (SHA-256: `acf8e0443c7ac7f22b21fe212b98368f7bc678a904c5d8968f8b6bcb8b540bd3`).

Lab build generated in conversation: `NetCraft_Core_v2.3.21_Delivery_Integrado_LAB_OFF.mcaddon` (SHA-256: `58038d96e828626e2b80473a30eaca423e3982fd83d3a96da737b61180e2614a`).

**Source file belongs to conversation attachment and generated lab addon; neither full original Core BP/RP nor resulting binary has been committed to this repository.** To reproduce, retrieve the exact source and the accompanying *Fontes_e_Testes.zip* from this conversation. The commit below is an integration audit record, not a claim that GitHub's CI built the user-supplied Core.

## Source inspection

- Original Core BP contains 449 files, RP 1,302 files, and two manifests with version `[2,3,20]`. Script entry `scripts/core/main.js`.
- Real `VIPSystem` is instantiated in `scripts/essentials/main.js`, stores VIPs in `Database("ncbr_vip_players")`, dynamic ranks in `Database("ncbr_vip_ranks")`; renewal uses `saveVIP(...,"renew")` and `applyVIP()`. These are NOT raw, permanent vanilla tags.
- Existing Core VIP rank tags must be configured explicitly, matching `ncbr:vip_explorer`, `ncbr:vip_elite`, and `ncbr:vip_supreme`. The addon does NOT invent or activate paid ranks/products.

## Local additive patch — separately shipped in this conversation

1. Manifest versions BP/RP `[2,3,21]`, module versions and mutual UUID dependencies updated; existing header/module UUIDs retained.
2. All 1,751 original files retained; three new BP scripts, plus targeted changes to `VIPSystem.js`, `Database.js`, Core main, Essentials version, boot probe and relic version string.
3. Added a *LAB-only* VIP grant method calling the **existing** VIP renewal logic, blocking unknown plans, creator interference and tier upgrades for manual review; Added synchronous `VIPPlayers.flushNow` to ensure VIP persistence **before** marking a payment grant applied.
4. Added pure executor library for server-verified jobs with exact name checks, mandatory trusted linked-player callback, write-ahead world receipt, capacity validation and replay quarantine.
5. Boot entry only installs an inert `Server.DeliveryIntegration` status/execute OFF facade. No event, network polling or hidden switch can process deliveries. No real Mercado Pago/Firebase credentials, transactions or recompensas enabled.

## Local verification

10/10 Node tests passed: LAB OFF boot facade, offline permission, strict payload validation, identity, item grants, duplicate suppression across engine reconstruction, full inventory and partial-write quarantine, VIP 30 days + renewal, unconfigured rank and upgrade, creator conflict and storage failure, source wiring. Zip verified; BP/RP mutual dependencies intact. **Tests use a local simulation of BDS APIs**, not actual Minecraft BDS.

This is a meaningful Core source integration but not a functioning commercial Delivery bridge. Next release blockers: test world on a real BDS clone, trustworthy Xbox account-to-order binding, authenticated gateway, approved store kit IDs, and a separate owner-approved release. Keep `main`, MagnoHost, public Worker, Production, real Pix and real grants untouched.

Previous v0.4.0 separate clone remains the backend compatibility harness and should not be confused with this official-Core *LAB OFF* patch.
