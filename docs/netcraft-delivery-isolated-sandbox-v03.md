# NetCraft Delivery — isolated simulation preflight, v0.3

**Do not install on MagnoHost yet. Not a live delivery system.**

## Isolation
- `scripts/delivery-local-https-demo.ts` creates an optional HTTPS server **on 127.0.0.1 only, port assigned by OS**. It has no auto-start and is not mounted in the website or Vercel. It requires `NODE_ENV=test`, `GCLOUD_PROJECT=demo-netcraft-admin-test`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085`, a test-only HMAC key and TLS cert/key file paths. The operator supplies them outside source code. It cannot receive requests from the MagnoHost public network.
- `server/delivery/emulatorStore.ts` atomically claims request nonces in `deliverySimulationNonces` through Firestore transactions, rejects replays and stale timestamps. `server/routes/deliverySimulation.ts` checks HMAC before claiming. Local non-persistent mode is only for unit tests.
- `minecraft/delivery-simulation/bedrockBootstrapInert.js` is not referenced in any manifest and refuses to start a connection. No addon or test pack is generated.
- No payment provider, real order, real item, VIP grant, or world manipulation is connected.

## BDS authentication constraint: IMPORTANT
Microsoft's `@minecraft/server-admin` API `secrets.get(name)` returns opaque `SecretString`, usable directly as an `HttpHeader` value. It **does not expose plaintext to the script**, so this API **cannot supply a raw key to the current JavaScript HMAC function**. The HMAC implementation has passing reference tests for injected keys in a Node test harness; that is not a production-ready BDS secret integration.

A future design can use a server-only opaque token as the header (scoped strictly to `/poll` and `/ack`), authenticate it **server-side**, and preserve atomic replay/idempotency protections. Or use an audited external signing broker. Both require additional threat modeling; do not put an HMAC secret in a behavior pack or `variables.json`.

## Next requirements
1. Choose/secure a *separate non-production* HTTPS sandbox host and database, entirely apart from any shared Firebase or Vercel production resources.
2. Review SecretString-based authentication for BDS 1.26.60.6 and add true `HttpHeader` instances with server-only secrets. Keep secrets off repo, console and addon exports.
3. Implement scoped server credentials, atomic nonce expiry/cleanup, request limits and authenticated endpoint tests using the actual BDS transport.
4. Test in a dedicated backup/instance, never on the public server first. Keep NetCraftCore and existing permissions untouched.
