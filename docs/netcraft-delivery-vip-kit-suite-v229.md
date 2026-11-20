# NetCraft Delivery — VIP Explorer + kits: clone-only suite (2026-11-01)

## Evidence and boundaries
The owner validated BDS 1.26.61.1 with NetherNet, an authenticated Redmi client, exactly two synthetic iron ingots, `GRANTED_AND_ACKED`, and no duplicate after reconnect/restart. Windows cleanup restored BDS-specific original Inbound and Outbound Block rules. This does **not** prove production payments or VIP grants.

This branch extends the **synthetic localhost fixture only** with distinct fixed receipt IDs:
- `d×64-1`: one-day VIP Explorer (`ncbr:vip_explorer`, must exist in Core).
- `d×64-3`: separate one-day renewal of Explorer.
- `d×64-2`: fixed 3 diamonds + 6 iron ingots, same item-executor path used for kits.
- Existing two-iron fixture `d×64-0` is unchanged and remains a separate fixture mode.

`kind=suite` offers VIP → renewal → kit, and persists individual ACKs. Untrusted rank tags, different quantities, missing token, missing/expired nonce, incorrect player, wrong environment, and replayed jobs must fail closed. The BDS Core validates rank registration, inventory space, writes receipts before applying grants, and quarantines uncertain writes. The new kit is **not** a product-store or Pix order.

## Next real BDS validation
Use the separate v2.2.9 LAB-only `.mcaddon` and accompanying self-contained Windows preparation bundle on a **fresh cloned world**. Do not replace the normal Core or touch the production host. Run local HTTPS and BDS on the same PC; prepare the verified NetherNet phone firewall exception and allow temporary BDS executable outbound for Xbox authentication, then restore both original BDS-specific blocks after tests. The BDS must have registered the exact Explorer rank tag; otherwise `HOLD_VIP_NOT_CONFIGURED` is expected. Do not fake a VIP by granting a tag directly.

Verify three distinct `GRANTED_AND_ACKED` lines and receipts; check inventory contents, ~2-day entitlement, no extra grants after reconnect/restart. Inventory-full testing is a separate negative scenario (no ACK until enough **empty** slots), not a production flow. A 24-hour real expiration is **not** validated by the short suite; use time-controlled unit tests for algorithmic checks and a separate real-world aging check before release.

## Production invariants
- Branch `redesign-mobile-solaris` only, no main, Production, MagnoHost, real orders or Worker activation.
- `dispatchEnabled:false`, `environment:synthetic_local`, loopback HTTPS and strict Core job validation.
- The site VIP product ID ↔ server rank mapping, authoritative approval timestamp, verified payment settlement, refunds, offline queue leasing, and operational audit logs are **not implemented** as commercial delivery and remain OFF.
