# NetCraftBR delivery bridge — simulation contract v0.1

Status: **NOT AUTHORIZED FOR REAL DELIVERY**. This document is a design and simulation boundary, not a public delivery endpoint. Never treat it as permission to dispatch.

## Addon compatibility (NetCraft Core v2.0.31 Bloco 2)
- The behavioral pack includes `scripts/essentials/Modules/VIPSystem.js`; VIP membership and rank data are kept internally in `ncbr_vip_players` and `ncbr_vip_ranks`. The internal `saveVIP` is not an exported safe external delivery API.
- Kits are reached through `Server.NCBRFeatures?.openRedeem?.(player)` in the Core. This is a player-facing redeem UI, **not** a trusted external item-grant API.
- Do not manipulate these databases, commands or tags from the demo pack. Core upgrades may change these internals.

## Proposed server-to-game protocol, not active
An authenticated server-side adapter will eventually pull eligible delivery jobs from the protected backend. No client-provided approval or checkout response is sufficient. The adapter must verify the order state against authenticated Mercado Pago GET, amount, receiver, SKU snapshot, and refund state; it must not use unsigned webhooks as approval.

Test envelope (for memory-only simulation):
```json
{
  "environment": "test",
  "dispatchEnabled": false,
  "deliveryId": "<64 lowercase hexadecimal characters>-<lineIndex>",
  "gamertag": "ExamplePlayer",
  "kind": "vip"
}
```
**There are no signing credentials, access tokens, HTTP polling or live delivery handlers in the simulator.** This envelope is not a real authentication format; an attacker may forge it, so it must never be accepted for actual grants.

Before production, implement an authenticated server-to-server protocol: short-lived credentials retained server-side, scoped permissions, server identity, TLS, replay protection, explicit ack after atomic delivery, retries and permanent idempotency ledger. Define and test the official, stable Core grant/revoke methods with the user; handle VIP expiry and offline kits, refunds, partial failures and reconciliation.

## Simulation semantics
- Reject malformed IDs, non-test environments or any `dispatchEnabled !== false`.
- Deduplicate by `deliveryId`; retries do not create another job.
- Offline players remain `waiting_for_player`, with no Core mutation.
- Online simulation transitions to `simulated_complete`, not actual delivery.
- Refund blocks pending and completed simulation entries; it does not revoke real VIPs.
- Do not enable delivery in the NetCraftBR site or change Production.

The separate `NetCraft_Delivery_SIMULACAO_v0.1.mcpack` artifact is **not** to be deployed on a live server. It only logs a deterministic demo. The original Core addon remains untouched.
