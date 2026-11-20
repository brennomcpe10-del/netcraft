# NetCraft Delivery HTTPS — simulation bridge (not deployed)

MagnoHost BDS 1.26.60.6 previously returned HTTP 200 for a one-shot GET to example.com with @minecraft/server-net. This verifies HTTPS egress to that host only; it does not validate the store API.

## Current new module
`minecraft/delivery-simulation/signedHttpsBridge.js` is **NOT imported into any Bedrock pack or production website**. Its factory rejects use unless simulation is explicitly enabled and all dependencies are injected. It only offers signed `/poll` and simulated `/ack`; neither performs Minecraft item/VIP grants. The test provides Node.js crypto as a stand-in for HMAC.

## Still NOT implemented / never assume production ready
- Real Bedrock-compatible HMAC-SHA256 signing implementation and secure storage of server-only keys; Node.js `crypto` cannot be imported directly by Bedrock scripts. `@minecraft/server-admin` secret access needs a separate reviewed bootstrap, not a hardcoded key.
- Real `@minecraft/server-net` HttpHeader/HttpRequest bootstrap and actual permission in a **dedicated test pack**.
- A non-production HTTPS test deployment of the Express delivery simulation router. The router currently has `NODE_ENV=test` and `VERCEL_ENV` production safeguards and is not mounted in the website public API.
- Durable anti-replay nonce records for multi-instance servers. Existing nonce tracking is in-memory only.
- Backend safety: signed authentication does not by itself prove provider approval, and `/seed` is fixture-only. No real Pix, Firestore production or dispatch operations allowed.

## Future preflight
1. In a separate test BDS and test host, mount only a test API over HTTPS with a dedicated allowlisted URI, use a test-only signing key stored outside the pack, and ensure no browser access to the key.
2. Deny any request when tests or permissions are disabled; explicitly test stale timestamp, forged HMAC, nonce replay, offline jobs, duplicate ACK and refunds.
3. Do not migrate to production until durable anti-replay, authenticated order checks, bounded retry/lease mechanics, refunds and Core grant/revoke APIs are approved.
