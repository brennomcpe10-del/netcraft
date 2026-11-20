# NetCraftCore v2.3.22 — BDS 1.26.61.1 compatibility patch (LAB OFF)

The owner tested v2.3.21 in a **local isolated** Windows BDS clone. It loaded world `NetCraftGateA` but skipped the Core script because `@minecraft/server@2.12.0-beta` requires the unavailable beta experiment; a second script module was also skipped. The block parser rejected five custom components when the script was not loaded, and the legacy PvP head used an obsolete `minecraft:custom_components` array plus an experimental `minecraft:block_entity` component.

## Source evidence and safe fix

- Based on the uploaded and inspected `NetCraft_Core_v2.3.21_Delivery_Integrado_LAB_OFF.mcaddon` SHA-256 `58038d96e828626e2b80473a30eaca423e3982fd83d3a96da737b61180e2614a`.
- Generated in conversation: `NetCraft_Core_v2.3.22_Delivery_LAB_OFF_Compat_BDS_1.26.61.mcaddon` SHA-256 `1e09126f123d7da35d37f7c9cd7603849b303e90677cc0f433fd75c341c32983`.
- Bundle: `Teste_NetCraftCore_v2.3.22_BDS_LAB_OFF_Correcao_Compatibilidade.zip` SHA-256 `3a4eaac85716562b7c506ce23ad08f354d8eee5c1aa986738d78a8c3006f42aa`.
- BP/RP manifest header versions, all module versions and BP↔RP UUID dependencies are exactly `[2,3,22]`. One BP script module `scripts/core/main.js` imports `../boot_probe.js` and keeps existing Core imports intact.
- API manifest dependencies are stable `@minecraft/server@2.11.0` and `@minecraft/server-ui@2.3.0`, confirmed for Bedrock 26.60 stable.
- PvP head block declares `ncbr:pvp_head_events: {}` in `components` (modern syntax). Removed `minecraft:block_entity`, an experimental dependency, **from the lab version**. Persisted dynamic-property metadata on legacy **placed custom heads** may be unavailable; the modern `minecraft:player_head` item implementation remains unchanged.
- Modified version displays in Core and Delivery LAB OFF. No activation of the bridge, payment or reward dispatch.

## Validations

- ZIP CRC, BP/RP manifests, UUID links, content counts, all JSON decoded, and **234/234 JS modules pass the Node ESM syntax check**.
- This **does NOT prove** the full addon boots in actual BDS, because no BDS executable is available in the artifact environment. Wait for user's real BDS logs to confirm script load and custom component registrations.

## Upgrade / reversibility

- The provided PowerShell installer targets only `C:\NetCraft-Lab\BDS-GateA`, and requires the exact SHA-256 addon, BDS closed, selected `NetCraftGateA`, online-mode/allow-list true, max-players 1, and LAN visibility false.
- It copies the entire lab world and stores original pack-stack JSON before installing; leaves v2.3.21 pack folders intact for possible rollback. Does not modify ports, firewall, DNS, production, main, Mercado Pago or live deliveries.
- To diagnose new runtime failures, capture the full `[Scripting]` and `[Blocks]` log entries after starting the lab BDS; never treat syntax checks as a commercial release gate.

The **full addon binaries are conversation artifacts**, not pushed into the NetCraft Delivery repository by this documentation commit. Keep the NetCraftCore source and Delivery website distinct.
