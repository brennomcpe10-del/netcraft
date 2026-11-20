# Delivery: durable HTTPS fixture gateway (candidate, NOT DEPLOYED)

This separate, OFF-by-default gateway at
`sandbox/cloudflare/verified-fixture-gateway.mjs` is a **clone-only test**
of the full BDS protocol. It does not use any Pix order, customer record,
Firebase collection or Mercado Pago credential. **A simulated ACK is NOT
proof that a payment was received.**

The existing Cloudflare `worker.mjs` and live `wrangler.toml` are unchanged.

## What is covered

- An authenticated challenge issued by a Durable Object (nonce state survives
  gateway Worker restarts), 60-second expiration and replay rejection.
- Exact preconfigured lab gamertag and secret, never injected into the source.
- Two **synthetic** grants: 3 diamonds + 6 iron ingots and one Explorer VIP
  for 30 days, both with the Bedrock verifier's `labFixture:true` marker.
- Durable offer state; repeated polls cannot duplicate an ambiguous grant.
- ACK for a verified executor receipt, and NACK with `receipt:none` only for
  documented failures before any receipt was written.
- No seed, refund, account, payment, admin or real-shop endpoints.

## Release gates

1. Keep `NC_SANDBOX_ENABLED` and `NC_FIXTURE_DELIVERY_ENABLED` both
   `false` unless a disposable Cloudflare Worker and **cloned BDS only**
   are separately authorized. Default `wrangler.toml` remains the empty
   zero-reward Worker.
2. Configure `NC_BDS_TEST_TOKEN` as a disposable 64-char lowercase hex
   secret through the Workers secrets UI, not version control. Keep it out
   of browser bundles and client storage.
3. Put the exact cloned player's gamertag in `NC_TEST_GAMERTAG`. Route
   clone-only HTTPS through its existing off-by-default BDS test adapter.
4. Run the real SQLite Durable Object workerd tests and then a cloned-world
   restart/ACK/replay/inventory-full/VIP-grant session. Synthetic unit tests
   alone do not validate Cloudflare infrastructure or Bedrock runtime.
5. Separately implement an authenticated **provider-verified Pix outbox**
   with immutable reward mappings, isolated payment records and a tested
   refund/chargeback lock. This fixture gateway MUST NOT be used for real
   orders, and it MUST NEVER be connected to public MagnoHost.

The gateway never turns on production commerce. No deploy has been performed.
