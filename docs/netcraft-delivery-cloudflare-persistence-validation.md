# NetCraft Delivery — verification status for Cloudflare sandbox

Branch: `redesign-mobile-solaris`. The Cloudflare Worker named `netcraft-delivery-sandbox-only` is **already published separately by its owner**, but this change does not deploy, update, or access that service. Its public setting is expected to remain `NC_SANDBOX_ENABLED="false"`.

## Automated regressions
`tests/delivery-cloudflare-nonce-concurrency.test.tsx` checks:
- A simulated Durable Object re-instantiation with the **same mock backing store** rejects an already claimed nonce.
- 24 concurrent synthetic claims of one nonce yield exactly one success and 23 replays.
- Invalid tokens or stale timestamps do not consume a nonce.
- Poll returns zero simulated jobs; ACK is always rejected and no refund route exists.

**Important distinction:** The shared-map fixture tests Worker logic, **not real SQLite persistence across a workerd process restart**. It is not evidence that a deployed Cloudflare Durable Object survives a restart or that concurrent requests are serialized by Cloudflare. Live persistence must be tested independently under explicitly authorized sandbox-only credentials, with no real deliveries.

## Local workerd integration gate (not yet executed automatically)
To establish runtime durability, start `wrangler dev --local --config wrangler.local-test.toml` with a sandbox-only token, claim a new nonce, stop the process, restart the same command with the **same local persistence directory**, then repeat the nonce with a current timestamp. The expected response is `401 {"error":"replay"}`. No committed `wrangler.local-test.toml` or `.dev.vars` should be deployed. The normal `wrangler.toml` keeps `NC_SANDBOX_ENABLED="false"`.

No secrets are stored in repository files. No external Cloudflare Worker change, Vercel deployment, MagnoHost addon, payment, refund, delivery or VIP grant is performed by these tests.
