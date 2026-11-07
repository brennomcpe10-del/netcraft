# Real workerd SQLite Durable Object verification (opt-in)

The file `scripts/test-cloudflare-workerd-local.mjs` creates its own **temporary config, ephemeral local test token, local SQLite persistence directory and test port 18787**. It runs a real Wrangler/Miniflare workerd locally, without any Cloudflare deploy or remote binding.

From the repository root on Windows PowerShell, with Wrangler installed and no other test server on port 18787:

```powershell
node .\scripts\test-cloudflare-workerd-local.mjs
```

Tests first nonce acceptance, duplicate replay, invalid token, expired timestamp, permanently disabled ACK, 24 concurrent requests claiming one nonce, and nonce replay after stopping/restarting workerd with the same local persistence directory. Cleanup runs in a `finally` block. This script does not change `wrangler.toml`, `wrangler.local-test.toml`, `.dev.vars`, or any published Worker.

This integration is **opt-in**, not claimed by the regular GitHub CI unless explicitly run in an isolated runner equipped with the Wrangler CLI. The existing mock tests remain separate. Real Cloudflare Durable Object persistence, BDS SecretString, player online checks, payments and Minecraft grants are **not** tested here.

The production-disabled Worker uses `NC_SANDBOX_ENABLED="false"`; keep it that way.
