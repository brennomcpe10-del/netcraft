# NetCraft Delivery — HTTPS sandbox readiness (2026-10-30)

Scope: branch `redesign-mobile-solaris` only. No public website route, Production change, payment, VIP or item delivery.

## Verified
- Previous CI `41110542059` passed.
- Isolated HTTP simulation supports HMAC or test-only BDS opaque secret header (only `/poll`, `/ack`), expiry/replay validation, refunded-job blocking and idempotent ACK.
- Firestore Emulator stores nonces atomically, so duplicate requests cannot both claim the same nonce. The local HTTPS demonstration binds to `127.0.0.1` only.
- An additional test covers cryptographic nonce generation if and only if a secure random provider is explicitly injected. Fails closed otherwise.

## Blockers — no authorized public HTTPS sandbox
1. The local loopback TLS demonstration cannot be accessed from a MagnoHost BDS. No external isolated HTTPS origin has been created or tested. Do not expose the local emulator as a public endpoint or connect it to shared/real Firebase.
2. A secure random generator available to the *actual* Bedrock Script API runtime is not confirmed. Do not substitute Math.random for authentication nonces.
3. The BDS test transport is not connected to the inert preflight pack, intentionally. A real `SecretString` header has not been exercised end-to-end against a test server.
4. The current polling prototype selects jobs by provided gamertag and does not independently verify online state or bind the authenticated game server to a player identity. Before live testing, add scoped, short-lived session authorization or an equivalent explicit online-state check.
5. The backend's HMAC path is test-only; an opaque BDS bearer token is a separate authentication mode, not HMAC. Never claim the BDS itself computes HMAC from SecretString.

## Minimum next verification
Create separate sandbox infrastructure with an independent test dataset and externally reachable HTTPS, protect by dedicated test token and restrictive egress; implement a vetted BDS random source; test `/poll`, `/ack`, replay, offline/no-ACK, refund race, and concurrent first ACK. Only then construct an active .mcpack for a cloned BDS instance, with no reward hooks.
