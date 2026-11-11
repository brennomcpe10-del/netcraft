# Cloudflare free HTTPS sandbox — NOT DEPLOYED

This standalone option uses **Cloudflare Workers Free + SQLite Durable Object** for durable anti-replay nonce claims, independent from Vercel, Firebase and payments.

## Safety defaults

- `NC_SANDBOX_ENABLED = "false"` in `wrangler.toml`; disabled by default.
- Secrets are supplied only through Cloudflare's secure secrets UI or `wrangler secret put NC_BDS_TEST_TOKEN`. NEVER commit the token or share it in chat.
- `/health` only reports a simulation when the sandbox is enabled.
- `/delivery/poll` authenticates a BDS token, timestamp, nonce, and synthetic gamertag, then returns **zero** jobs. It never reads paid orders.
- `/delivery/ack` always replies `409 ack_disabled`, even with a valid token.
- `/seed`, `/refund`, `/retry` and any real payment/reward handlers are absent. NO delivery takes place.
- A SQLite-backed Durable Object persists nonce claims atomically, including across restarts.
- No external database, production secrets, Minecraft server connection or Pix data.

## Deployment preparation — requires YOUR explicit action, do not perform yet

1. Create/use a separate Cloudflare account/project for tests; choose the **Workers Free** tier, and review limits before authorizing any changes.
2. Restrict deployment to the `sandbox/cloudflare` folder from the `redesign-mobile-solaris` branch. **Do not connect the main repo to auto-deploy by default**.
3. Run `npx wrangler login` locally, then from `sandbox/cloudflare` run `npx wrangler secret put NC_BDS_TEST_TOKEN` using a new random test-only secret of at least 32 characters. Do not reuse secrets from Vercel, MagnoHost or production.
4. After confirming the isolated account, run `npx wrangler deploy`. The endpoint is disabled at the `/health` gate until you explicitly set `NC_SANDBOX_ENABLED` to `"true"` in the sandbox-only config and redeploy.
5. A health request can confirm HTTPS routing but **cannot** prove Bedrock SecretString compatibility. The Bedrock public server must stay untouched; any network tests must use an independent cloned BDS instance with its own test credentials.
6. Do not install the currently inert `.mcpack` as an active delivery addon or attempt a payment.

## Remaining technical gates
- Actual Cloudflare deployment and HTTPS response, verified from a separate machine.
- Validate SecretString/HttpHeader and secure nonce availability in BDS 1.26.60.6.
- Real authenticated poll/ack to a demo-only test dataset, offline-player sessions, idempotency and refund races. Current Worker **does not** implement these; it is deliberately only a secure transport preflight.
- Avoid exposing BDS secrets in addon manifests, repository files or public chats.

Official docs: https://developers.cloudflare.com/workers/platform/limits/ and https://developers.cloudflare.com/durable-objects/
