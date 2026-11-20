# NetCraftCore v2.2.7 → Pix outbox integration (2026-11-01)

Real Bedrock clone smoke tests reported by the owner:
- Script event item test: `Teste items: applied`, received **2 iron ingots**.
- Script event VIP test after registering Explorer: `Teste vip: applied`.
- No screenshot showing an explicit second execution or server restart; do not overclaim replay/restart evidence.

## Code integrated in this milestone

New `server/delivery/coreJobContract.ts`: compiles a verified test-order
outbox line into the exact `netcraft.delivery.v1` **items** JSON accepted by
the executor in v2.2.7. Bounded vanilla IDs and quantities, canonical item
ordering, deterministic order-line ID and normalized gamertag are enforced.
The draft is stored alongside the existing private `pixTestDeliveries` row
when an authenticated Orders API GET confirms approval. Integration tests
exercise the saved draft with a mixed kit+VIP cart.

Every draft explicitly contains `executable:false` and
`dispatchEnabled:false`. It is NOT a grant, not an active poll endpoint,
not a payment-proof substitute, and no bridge has been deployed. No public
or Production endpoint exposes this private test draft.

VIPs are intentionally blocked: the site product ID must be explicitly
linked to an existing `ncbr:vip_*` rank in the Core and an authoritative
approval timestamp/duration policy. Do not infer a rank from the display name.

## Next implementation milestone (not yet completed)

Build an isolated, server-only BDS HTTPS bridge that authenticates and
leases authorized test jobs, invokes the verified Core executor on a
cloned world, then ACKs persisted receipts. Test offline players,
replays, uncertain partial grants, refunds, and restarts before
considering any real sale. Production, main, public Worker, real payment
credentials, MagnoHost and customer data remain untouched.
